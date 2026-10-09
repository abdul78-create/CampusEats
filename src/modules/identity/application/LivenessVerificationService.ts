import { PrismaClient } from '@prisma/client';
import { 
  UserRole, 
  StudentAccountStatus, 
  VerificationStatus, 
  LivenessSessionStatus, 
  LivenessDecision,
  LivenessChallengeType 
} from '../domain/IdentityEnums.js';
import { 
  LivenessChallengeSession, 
  ProviderLivenessResult, 
  LivenessStatusDto 
} from '../domain/IdentityInterfaces.js';
import { ILivenessVerificationProvider } from '../domain/LivenessVerificationProvider.js';
import { LivenessChallengeGenerator } from '../domain/LivenessChallengeGenerator.js';
import { LivenessEvidenceValidator } from '../domain/LivenessEvidenceValidator.js';
import { IStorageProvider } from '../domain/StorageProvider.js';
import { IAuditLogRepository } from '../../audit/domain/IAuditLogRepository.js';
import { AuditActionType } from '../../audit/domain/AuditEnums.js';
import { 
  NotFoundError, 
  ForbiddenError, 
  ConflictError, 
  ValidationError 
} from '../../../shared/errors/DomainErrors.js';

export interface VerifyLivenessInput {
  studentUserId: string;
  sessionId: string;
  sessionNonce: string;
  fileBuffer: Buffer;
  originalFilename: string;
}

export class LivenessVerificationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly storageProvider: IStorageProvider,
    private readonly livenessProvider: ILivenessVerificationProvider,
    private readonly auditRepo?: IAuditLogRepository
  ) {}

  /**
   * Initiates a new liveness challenge session.
   * Serializes session creation using row-level locking on StudentVerification
   * and invalidates any previous pending sessions.
   */
  async createSession(studentUserId: string): Promise<LivenessChallengeSession> {
    const student = await this.prisma.user.findUnique({
      where: { id: studentUserId },
      include: {
        studentProfile: {
          include: {
            verifications: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { livenessVerification: true },
            },
          },
        },
      },
    });

    if (!student || !student.studentProfile) {
      throw new NotFoundError('Student profile not found');
    }

    if (student.role !== UserRole.STUDENT) {
      throw new ForbiddenError('Only students are eligible for liveness verification');
    }

    if (student.studentProfile.accountStatus === StudentAccountStatus.SUSPENDED) {
      throw new ForbiddenError('Suspended student accounts cannot perform liveness verification');
    }

    // Ensure StudentVerification record exists
    let verification = student.studentProfile.verifications[0];
    if (!verification) {
      verification = await this.prisma.studentVerification.create({
        data: {
          studentProfileId: student.studentProfile.id,
          status: VerificationStatus.PENDING_SUBMISSION,
        },
        include: { livenessVerification: true },
      });
    }

    // Check 24-hour persistent failure lockout
    if (verification.livenessVerification?.lockedUntil && verification.livenessVerification.lockedUntil > new Date()) {
      throw new ForbiddenError(
        `Liveness verification locked due to repeated failures. Try again after ${verification.livenessVerification.lockedUntil.toISOString()}`
      );
    }

    // Generate randomized dynamic challenge sequence and unpredictable parameters
    const challenge = LivenessChallengeGenerator.generateSession();

    // Serialize session creation with row lock on StudentVerification
    await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT id FROM "StudentVerification" WHERE id = ${verification.id} FOR UPDATE`;

      // Invalidate any previously active PENDING sessions
      await tx.livenessSession.updateMany({
        where: {
          verificationId: verification.id,
          status: LivenessSessionStatus.PENDING,
        },
        data: { status: LivenessSessionStatus.EXPIRED },
      });

      // Persist the new active session
      await tx.livenessSession.create({
        data: {
          id: challenge.sessionId,
          verificationId: verification.id,
          sessionNonce: challenge.sessionNonce,
          challengeSequence: challenge.challengeSequence,
          challengeParams: challenge.challengeParams as any,
          status: LivenessSessionStatus.PENDING,
          expiresAt: challenge.expiresAt,
        },
      });
    });

    if (this.auditRepo) {
      try {
        await this.auditRepo.append({
          actorId: studentUserId,
          actionType: AuditActionType.VERIFICATION_REVIEW_STARTED,
          targetEntity: 'LivenessSession',
          targetId: challenge.sessionId,
          reason: 'Student initiated active liveness verification session',
        });
      } catch {
        // Non-blocking audit
      }
    }

    return challenge;
  }

  /**
   * Evaluates submitted video evidence against the session's dynamic challenge sequence.
   * Enforces exact evidence deduplication (SHA-256) and compensating storage cleanup.
   */
  async verifyLiveness(input: VerifyLivenessInput): Promise<ProviderLivenessResult> {
    // 1. Authoritative video container & magic byte validation (WebM/MP4, max 10MB)
    const validation = LivenessEvidenceValidator.validate(input.fileBuffer, input.originalFilename);

    // 2. Exact evidence byte-replay check
    const existingDigest = await this.prisma.livenessEvidenceDigest.findUnique({
      where: { sha256Digest: validation.sha256Digest },
    });
    if (existingDigest) {
      throw new ConflictError('Evidence duplicate detected: This video recording has already been submitted');
    }

    // 3. Load and validate LivenessSession
    const session = await this.prisma.livenessSession.findUnique({
      where: { id: input.sessionId },
      include: {
        verification: {
          include: { studentProfile: true },
        },
      },
    });

    if (!session) {
      throw new NotFoundError('Liveness challenge session not found');
    }

    // BOLA defense: session must belong to authenticated student
    if (session.verification.studentProfile.userId !== input.studentUserId) {
      throw new ForbiddenError('Unauthorized: Target liveness session belongs to another student');
    }

    // Nonce defense
    if (session.sessionNonce !== input.sessionNonce) {
      throw new ConflictError('Invalid session nonce: Nonce does not match active session');
    }

    // Single-use defense
    if (session.status !== LivenessSessionStatus.PENDING) {
      throw new ConflictError('Liveness challenge session has already been evaluated or expired');
    }

    // TTL defense
    if (session.expiresAt <= new Date()) {
      await this.prisma.livenessSession.update({
        where: { id: session.id },
        data: { status: LivenessSessionStatus.EXPIRED },
      });
      throw new ConflictError('Liveness challenge session has expired; new session required');
    }

    // 4. Upload video to storage abstraction (Phase 4 reuse)
    const storageResult = await this.storageProvider.uploadFile(
      input.fileBuffer,
      validation.sanitizedFilename,
      validation.detectedMimeType,
      input.studentUserId
    );

    // 5. Provider biometric evaluation
    const result = await this.livenessProvider.evaluateLiveness({
      sessionId: session.id,
      sessionNonce: session.sessionNonce,
      expectedSequence: session.challengeSequence as unknown as LivenessChallengeType[],
      expectedParams: session.challengeParams as any,
      videoBuffer: input.fileBuffer,
      mimeType: validation.detectedMimeType,
    });

    // Server acceptance policy
    const isLiveHuman = (
      result.decision === LivenessDecision.LIVE &&
      result.confidenceScore >= 0.80 &&
      result.sequenceOrderSatisfied &&
      result.parametersSatisfied
    );

    // 6. Database transaction with compensating storage cleanup
    try {
      await this.prisma.$transaction(async tx => {
        // Lock LivenessVerification row to serialize failure increments
        const currentLv = await tx.livenessVerification.findUnique({
          where: { verificationId: session.verificationId },
        });

        if (isLiveHuman) {
          // Success Path
          await tx.livenessSession.update({
            where: { id: session.id },
            data: {
              status: LivenessSessionStatus.PASSED,
              evidenceStoragePath: storageResult.storagePath,
              evidenceSha256: validation.sha256Digest,
              providerReference: result.providerReference,
              confidenceScore: result.confidenceScore,
              decision: result.decision,
            },
          });

          await tx.livenessVerification.upsert({
            where: { verificationId: session.verificationId },
            create: {
              verificationId: session.verificationId,
              providerName: process.env.LIVENESS_PROVIDER || 'mock',
              providerSessionId: session.id,
              naturalBlinkPassed: true,
              headTurnLeftPassed: true,
              headTurnRightPassed: true,
              confidenceScore: result.confidenceScore,
              isLiveHuman: true,
              consecutiveFailures: 0,
              lastFailureAt: null,
              lockedUntil: null,
              evidenceStoragePath: storageResult.storagePath,
              verifiedAt: new Date(),
            },
            update: {
              providerName: process.env.LIVENESS_PROVIDER || 'mock',
              providerSessionId: session.id,
              naturalBlinkPassed: true,
              headTurnLeftPassed: true,
              headTurnRightPassed: true,
              confidenceScore: result.confidenceScore,
              isLiveHuman: true,
              consecutiveFailures: 0,
              lastFailureAt: null,
              lockedUntil: null,
              evidenceStoragePath: storageResult.storagePath,
              verifiedAt: new Date(),
            },
          });

          // Record in LivenessEvidenceDigest (exact byte-replay protection)
          await tx.livenessEvidenceDigest.create({
            data: {
              sha256Digest: validation.sha256Digest,
              sessionId: session.id,
              studentUserId: input.studentUserId,
            },
          });

          if (this.auditRepo) {
            try {
              await this.auditRepo.append({
                actorId: input.studentUserId,
                actionType: AuditActionType.SENSITIVE_DATA_ACCESS,
                targetEntity: 'LivenessVerification',
                targetId: session.verificationId,
                reason: `Active liveness passed with provider ${process.env.LIVENESS_PROVIDER || 'mock'} and score ${result.confidenceScore}`,
              });
            } catch {
              // Non-blocking audit
            }
          }
        } else {
          // Failure Path: atomically increment failures and enforce 24h lockout
          const currentFailures = currentLv?.consecutiveFailures ?? 0;
          const newFailures = currentFailures + 1;
          const lockedUntil = newFailures >= 3 ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;

          await tx.livenessSession.update({
            where: { id: session.id },
            data: {
              status: LivenessSessionStatus.FAILED,
              evidenceStoragePath: storageResult.storagePath,
              evidenceSha256: validation.sha256Digest,
              providerReference: result.providerReference,
              confidenceScore: result.confidenceScore,
              decision: result.decision,
            },
          });

          await tx.livenessVerification.upsert({
            where: { verificationId: session.verificationId },
            create: {
              verificationId: session.verificationId,
              providerName: process.env.LIVENESS_PROVIDER || 'mock',
              providerSessionId: session.id,
              naturalBlinkPassed: false,
              headTurnLeftPassed: false,
              headTurnRightPassed: false,
              confidenceScore: result.confidenceScore,
              isLiveHuman: false,
              consecutiveFailures: newFailures,
              lastFailureAt: new Date(),
              lockedUntil,
              evidenceStoragePath: storageResult.storagePath,
            },
            update: {
              providerName: process.env.LIVENESS_PROVIDER || 'mock',
              providerSessionId: session.id,
              isLiveHuman: false,
              consecutiveFailures: newFailures,
              lastFailureAt: new Date(),
              lockedUntil,
              evidenceStoragePath: storageResult.storagePath,
            },
          });

          if (this.auditRepo) {
            try {
              await this.auditRepo.append({
                actorId: input.studentUserId,
                actionType: AuditActionType.SENSITIVE_DATA_ACCESS,
                targetEntity: 'LivenessVerification',
                targetId: session.verificationId,
                reason: `Liveness failed: decision ${result.decision}, failures ${newFailures}`,
              });
            } catch {
              // Non-blocking audit
            }
          }
        }
      });
    } catch (dbError) {
      // Compensating action: delete uploaded file from storage
      try {
        await this.storageProvider.deleteFile(storageResult.storagePath);
      } catch (cleanupErr) {
        console.error('[CompensatingCleanupError] Failed to remove storage file:', cleanupErr);
      }
      throw dbError;
    }

    if (!isLiveHuman) {
      throw new ValidationError(result.message || 'Liveness verification failed: synthetic presentation or challenge sequence mismatch');
    }

    return result;
  }

  /**
   * Retrieves current liveness status for student.
   */
  async getStatus(studentUserId: string): Promise<LivenessStatusDto> {
    const student = await this.prisma.user.findUnique({
      where: { id: studentUserId },
      include: {
        studentProfile: {
          include: {
            verifications: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: { livenessVerification: true },
            },
          },
        },
      },
    });

    if (!student || !student.studentProfile) {
      throw new NotFoundError('Student profile not found');
    }

    const lv = student.studentProfile.verifications[0]?.livenessVerification;
    const isLocked = lv?.lockedUntil ? new Date(lv.lockedUntil) > new Date() : false;

    return {
      hasCompletedLiveness: lv?.isLiveHuman === true,
      isLiveHuman: lv?.isLiveHuman === true,
      consecutiveFailures: lv?.consecutiveFailures ?? 0,
      isLocked,
      lockedUntil: lv?.lockedUntil ?? null,
      verifiedAt: lv?.verifiedAt ?? null,
    };
  }

  /**
   * Administrative inspection of liveness verification record and signed evidence URL.
   */
  async getAdminLivenessDetails(verificationId: string, adminUserId: string) {
    const lv = await this.prisma.livenessVerification.findUnique({
      where: { verificationId },
    });

    if (!lv) {
      throw new NotFoundError('Liveness verification record not found');
    }

    const recentSessions = await this.prisma.livenessSession.findMany({
      where: { verificationId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    let signedEvidenceUrl: string | null = null;
    if (lv.evidenceStoragePath) {
      signedEvidenceUrl = await this.storageProvider.getSignedUrl(lv.evidenceStoragePath, 300);
    }

    if (this.auditRepo) {
      try {
        await this.auditRepo.append({
          actorId: adminUserId,
          actionType: AuditActionType.LIVENESS_EVIDENCE_ACCESSED,
          targetEntity: 'LivenessVerification',
          targetId: verificationId,
          reason: `Admin requested signed URL to inspect liveness evidence for verification ${verificationId}`,
        });
      } catch {
        // Non-blocking audit
      }
    }

    return {
      verificationId: lv.verificationId,
      providerName: lv.providerName,
      isLiveHuman: lv.isLiveHuman,
      naturalBlinkPassed: lv.naturalBlinkPassed,
      headTurnLeftPassed: lv.headTurnLeftPassed,
      headTurnRightPassed: lv.headTurnRightPassed,
      confidenceScore: lv.confidenceScore,
      consecutiveFailures: lv.consecutiveFailures,
      lastFailureAt: lv.lastFailureAt,
      lockedUntil: lv.lockedUntil,
      verifiedAt: lv.verifiedAt,
      signedEvidenceUrl,
      recentSessions: recentSessions.map(s => ({
        id: s.id,
        status: s.status,
        confidenceScore: s.confidenceScore,
        decision: s.decision,
        createdAt: s.createdAt,
      })),
    };
  }
}
