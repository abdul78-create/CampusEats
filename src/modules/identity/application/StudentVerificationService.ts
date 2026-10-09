import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { IStudentVerificationRepository, VerificationRecord } from '../domain/IStudentVerificationRepository.js';
import { IStorageProvider } from '../domain/StorageProvider.js';
import { DocumentValidationService } from '../domain/DocumentValidationService.js';
import { VerificationStateMachine } from '../domain/VerificationStateMachine.js';
import { 
  VerificationStatus, 
  StudentAccountStatus, 
  VerificationRejectionReason,
  UserRole
} from '../domain/IdentityEnums.js';
import { IAuditLogRepository } from '../../audit/domain/IAuditLogRepository.js';
import { AuditActionType } from '../../audit/domain/AuditEnums.js';
import { 
  NotFoundError, 
  ForbiddenError,
  ValidationError 
} from '../../../shared/errors/DomainErrors.js';

export interface SubmitDocumentInput {
  studentUserId: string;
  fileBuffer: Buffer;
  originalFilename: string;
  documentType?: string;
}

export interface VerificationStatusDto {
  status: VerificationStatus;
  accountStatus: StudentAccountStatus;
  isEligibleToOrder: boolean;
  rejectionReasonCode?: string | null;
  rejectionReason?: string | null;
  submittedAt?: Date | null;
  reviewedAt?: Date | null;
  canSubmitDocument: boolean;
  document?: {
    id: string;
    documentType: string;
    originalFilename?: string | null;
    fileMimeType: string;
    fileSizeBytes: number;
    createdAt: Date;
  } | null;
}

export interface StudentProfileDto {
  id: string;
  userId: string;
  fullName: string;
  universityRegNumber: string;
  email: string;
  phoneNumber: string;
  accountStatus: StudentAccountStatus;
  verificationStatus: VerificationStatus;
  isEligibleToOrder: boolean;
  createdAt: Date;
}

export class StudentVerificationService {
  constructor(
    private readonly verificationRepo: IStudentVerificationRepository,
    private readonly storageProvider: IStorageProvider,
    private readonly auditRepo?: IAuditLogRepository,
    private readonly prisma?: PrismaClient
  ) {}

  /**
   * Submits a university student identity document for review.
   * Performs deep file signature verification, sanitizes filename,
   * stores via IStorageProvider, and persists metadata in database.
   */
  async submitDocument(input: SubmitDocumentInput): Promise<VerificationStatusDto> {
    const profile = await this.verificationRepo.findProfileByUserId(input.studentUserId);
    if (!profile) {
      throw new NotFoundError('Student profile not found for authenticated user');
    }

    // Check account status
    if (profile.accountStatus === StudentAccountStatus.SUSPENDED) {
      throw new ForbiddenError('Suspended student accounts cannot submit verification documents.');
    }

    // 1. Authoritative content signature and format validation (PDF/JPEG/PNG, max 5MB)
    const validation = DocumentValidationService.validate(input.fileBuffer, input.originalFilename);

    // 2. Upload to storage abstraction (raw bytes are NEVER written to PostgreSQL)
    const storageResult = await this.storageProvider.uploadFile(
      input.fileBuffer,
      validation.sanitizedFilename,
      validation.detectedMimeType,
      input.studentUserId
    );

    // 3. Persist document metadata and transition state to UNDER_REVIEW
    const verification = await this.verificationRepo.submitIdentityDocument({
      verificationId: crypto.randomUUID(),
      studentProfileId: profile.id,
      documentType: input.documentType || 'UNIVERSITY_ID_CARD',
      originalFilename: validation.sanitizedFilename,
      fileStoragePath: storageResult.storagePath,
      fileMimeType: validation.detectedMimeType,
      fileSizeBytes: validation.fileSizeBytes,
      fileSha256Checksum: validation.sha256Checksum,
    });

    // 4. Log immutable security audit event
    if (this.auditRepo) {
      try {
        await this.auditRepo.append({
          actorId: input.studentUserId,
          actionType: AuditActionType.STUDENT_DOCUMENT_SUBMITTED,
          targetEntity: 'StudentVerification',
          targetId: verification.id,
          newValue: {
            verificationId: verification.id,
            status: VerificationStatus.UNDER_REVIEW,
            fileMimeType: validation.detectedMimeType,
            fileSizeBytes: validation.fileSizeBytes,
            sha256Checksum: validation.sha256Checksum,
          },
          reason: 'Student uploaded identity document for university verification',
        });
      } catch {
        // Audit failures should not block submission
      }
    }

    // 5. Persistent student notification
    if (this.prisma) {
      try {
        await this.prisma.notification.create({
          data: {
            userId: input.studentUserId,
            type: 'VERIFICATION_UPDATE',
            title: 'Identity Document Submitted',
            message: 'Your university identity document has been submitted and is currently under review by campus administrators.',
            payload: {
              verificationId: verification.id,
              status: VerificationStatus.UNDER_REVIEW,
            },
          },
        });
      } catch {
        // Notification delivery is non-blocking
      }
    }

    return this.mapToStatusDto(verification);
  }

  /**
   * Retrieves current verification state for the authenticated student.
   */
  async getVerificationStatus(studentUserId: string): Promise<VerificationStatusDto> {
    const profile = await this.verificationRepo.findProfileByUserId(studentUserId);
    if (!profile) {
      throw new NotFoundError('Student profile not found');
    }

    const verification = await this.verificationRepo.findLatestVerificationByProfileId(profile.id);

    if (!verification) {
      return {
        status: VerificationStatus.PENDING_SUBMISSION,
        accountStatus: profile.accountStatus,
        isEligibleToOrder: false,
        canSubmitDocument: true,
        document: null,
      };
    }

    return this.mapToStatusDto(verification);
  }

  /**
   * Retrieves secure student profile representation.
   */
  async getStudentProfile(studentUserId: string): Promise<StudentProfileDto> {
    const profile = await this.verificationRepo.findProfileByUserId(studentUserId);
    if (!profile) {
      throw new NotFoundError('Student profile not found');
    }

    const verification = await this.verificationRepo.findLatestVerificationByProfileId(profile.id);
    const verifStatus = verification ? verification.status : VerificationStatus.PENDING_SUBMISSION;

    const eligibility = VerificationStateMachine.checkOrderingEligibility({
      userIsActive: profile.user.isActive,
      role: UserRole.STUDENT,
      accountStatus: profile.accountStatus,
      verificationStatus: verifStatus,
    });

    return {
      id: profile.id,
      userId: profile.userId,
      fullName: profile.fullName,
      universityRegNumber: profile.universityRegNumber,
      email: profile.user.email,
      phoneNumber: profile.user.phoneNumber,
      accountStatus: profile.accountStatus,
      verificationStatus: verifStatus,
      isEligibleToOrder: eligibility.eligible,
      createdAt: new Date(),
    };
  }

  /**
   * Generates a temporary signed download URL for student's own identity document.
   * Enforces strict student IDOR ownership.
   */
  async getStudentDocumentUrl(studentUserId: string, documentId: string): Promise<{ url: string; expiresInSeconds: number }> {
    const profile = await this.verificationRepo.findProfileByUserId(studentUserId);
    if (!profile) {
      throw new NotFoundError('Student profile not found');
    }

    // Lookup document in database
    let doc: any = null;
    if (this.prisma) {
      doc = await this.prisma.identityDocument.findUnique({
        where: { id: documentId },
        include: { verification: { include: { studentProfile: true } } },
      });
    }

    if (!doc) {
      const verification = await this.verificationRepo.findLatestVerificationByProfileId(profile.id);
      if (verification && verification.identityDocument && verification.identityDocument.id === documentId) {
        doc = {
          fileStoragePath: verification.identityDocument.fileStoragePath,
          verification: { studentProfile: { userId: profile.userId } },
        };
      }
    }

    if (!doc) {
      throw new NotFoundError('Identity document not found');
    }

    if (doc.verification?.studentProfile?.userId !== studentUserId) {
      throw new ForbiddenError('Access denied: You can only access your own identity document');
    }

    const expiresInSeconds = 300; // 5 minutes
    const signedUrl = await this.storageProvider.getSignedUrl(
      doc.fileStoragePath,
      expiresInSeconds
    );

    return {
      url: signedUrl,
      expiresInSeconds,
    };
  }

  /**
   * Administrative verification review queue.
   */
  async getAdminVerificationQueue(params: {
    status?: VerificationStatus;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    const { records, total } = await this.verificationRepo.listVerifications({
      status: params.status,
      skip,
      take: limit,
    });

    return {
      data: records.map((r) => ({
        id: r.id,
        studentProfileId: r.studentProfileId,
        studentName: r.studentProfile.fullName,
        universityRegNumber: r.studentProfile.universityRegNumber,
        email: r.studentProfile.user.email,
        phoneNumber: r.studentProfile.user.phoneNumber,
        status: r.status,
        rejectionReasonCode: r.rejectionReasonCode,
        rejectionReason: r.rejectionReason,
        submittedAt: r.submittedAt,
        reviewedAt: r.reviewedAt,
        createdAt: r.createdAt,
        document: r.identityDocument
          ? {
              id: r.identityDocument.id,
              documentType: r.identityDocument.documentType,
              originalFilename: r.identityDocument.originalFilename,
              fileMimeType: r.identityDocument.fileMimeType,
              fileSizeBytes: r.identityDocument.fileSizeBytes,
              createdAt: r.identityDocument.createdAt,
            }
          : null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Generates a temporary signed URL for an admin to inspect the student document.
   */
  async getAdminDocumentUrl(adminUserId: string, verificationId: string): Promise<{ url: string; expiresInSeconds: number }> {
    const verification = await this.verificationRepo.findVerificationById(verificationId);
    if (!verification || !verification.identityDocument) {
      throw new NotFoundError('Identity document not found for verification record');
    }

    const expiresInSeconds = 300; // 5 minutes
    const signedUrl = await this.storageProvider.getSignedUrl(
      verification.identityDocument.fileStoragePath,
      expiresInSeconds
    );

    // Record audit log for accessing sensitive document
    if (this.auditRepo) {
      try {
        await this.auditRepo.append({
          actorId: adminUserId,
          actionType: AuditActionType.STUDENT_DOCUMENT_ACCESSED,
          targetEntity: 'IdentityDocument',
          targetId: verification.identityDocument.id,
          reason: `Admin requested signed URL to inspect identity document for verification ${verificationId}`,
        });
      } catch {
        // Non-blocking audit
      }
    }

    return {
      url: signedUrl,
      expiresInSeconds,
    };
  }

  /**
   * Approves student verification. Transitions verification and student account to ACTIVE.
   */
  async approveVerification(adminUserId: string, verificationId: string): Promise<VerificationStatusDto> {
    const verification = await this.verificationRepo.findVerificationById(verificationId);
    if (!verification) {
      throw new NotFoundError('Verification record not found');
    }

    if (!verification.identityDocument) {
      throw new ValidationError('Cannot approve verification: Identity document is missing.');
    }

    if (!verification.livenessVerification || !verification.livenessVerification.isLiveHuman) {
      throw new ValidationError('Cannot approve verification: Active liveness verification is incomplete or failed.');
    }

    const updated = await this.verificationRepo.approveVerification({
      verificationId,
      adminId: adminUserId,
      reviewedAt: new Date(),
    });

    // Record audit log
    if (this.auditRepo) {
      try {
        await this.auditRepo.append({
          actorId: adminUserId,
          actionType: AuditActionType.VERIFICATION_APPROVED,
          targetEntity: 'StudentVerification',
          targetId: verificationId,
          previousValue: { status: VerificationStatus.UNDER_REVIEW },
          newValue: { status: VerificationStatus.ACTIVE, accountStatus: StudentAccountStatus.ACTIVE },
          reason: 'Administrator approved student university identity verification',
        });
      } catch {
        // Non-blocking audit
      }
    }

    // Record student notification
    if (this.prisma) {
      try {
        await this.prisma.notification.create({
          data: {
            userId: updated.studentProfile.userId,
            type: 'VERIFICATION_UPDATE',
            title: 'Verification Approved',
            message: 'Your student identity verification has been approved. You are now verified and eligible to order!',
            payload: {
              verificationId: updated.id,
              status: VerificationStatus.ACTIVE,
            },
          },
        });
      } catch {
        // Non-blocking notification
      }
    }

    return this.mapToStatusDto(updated);
  }

  /**
   * Rejects student verification with a structured reason code.
   */
  async rejectVerification(
    adminUserId: string,
    verificationId: string,
    reasonCode: VerificationRejectionReason,
    notes?: string
  ): Promise<VerificationStatusDto> {
    const validatedCode = VerificationStateMachine.assertValidRejectionReason(reasonCode);

    const updated = await this.verificationRepo.rejectVerification({
      verificationId,
      adminId: adminUserId,
      reasonCode: validatedCode,
      notes,
      reviewedAt: new Date(),
    });

    // Record audit log
    if (this.auditRepo) {
      try {
        await this.auditRepo.append({
          actorId: adminUserId,
          actionType: AuditActionType.VERIFICATION_REJECTED,
          targetEntity: 'StudentVerification',
          targetId: verificationId,
          previousValue: { status: VerificationStatus.UNDER_REVIEW },
          newValue: { 
            status: VerificationStatus.REJECTED, 
            accountStatus: StudentAccountStatus.REJECTED,
            reasonCode: validatedCode,
            notes,
          },
          reason: `Administrator rejected student verification: ${validatedCode}`,
        });
      } catch {
        // Non-blocking audit
      }
    }

    // Record student notification
    if (this.prisma) {
      try {
        await this.prisma.notification.create({
          data: {
            userId: updated.studentProfile.userId,
            type: 'VERIFICATION_UPDATE',
            title: 'Verification Rejected',
            message: `Your student identity verification was rejected: ${validatedCode}. Please review requirements and re-submit a valid document.`,
            payload: {
              verificationId: updated.id,
              status: VerificationStatus.REJECTED,
              reasonCode: validatedCode,
            },
          },
        });
      } catch {
        // Non-blocking notification
      }
    }

    return this.mapToStatusDto(updated);
  }

  /**
   * Administratively suspends a student account.
   */
  async suspendStudent(adminUserId: string, studentUserId: string, reason: string): Promise<void> {
    const profile = await this.verificationRepo.findProfileByUserId(studentUserId);
    if (!profile) {
      throw new NotFoundError(`Student profile not found for user: ${studentUserId}`);
    }

    await this.verificationRepo.suspendStudent({ profileId: profile.id });

    if (this.auditRepo) {
      try {
        await this.auditRepo.append({
          actorId: adminUserId,
          actionType: AuditActionType.STUDENT_SUSPENDED,
          targetEntity: 'StudentProfile',
          targetId: profile.id,
          reason: reason || 'Administrative suspension',
          newValue: { accountStatus: StudentAccountStatus.SUSPENDED },
        });
      } catch {
        // Non-blocking audit
      }
    }

    if (this.prisma) {
      try {
        await this.prisma.notification.create({
          data: {
            userId: studentUserId,
            type: 'SYSTEM_ALERT',
            title: 'Account Suspended',
            message: `Your student account has been administratively suspended. Reason: ${reason || 'Administrative action'}`,
            payload: { accountStatus: StudentAccountStatus.SUSPENDED },
          },
        });
      } catch {
        // Non-blocking notification
      }
    }
  }

  /**
   * Administratively reactivates a suspended student account.
   */
  async reactivateStudent(adminUserId: string, studentUserId: string): Promise<void> {
    const profile = await this.verificationRepo.findProfileByUserId(studentUserId);
    if (!profile) {
      throw new NotFoundError(`Student profile not found for user: ${studentUserId}`);
    }

    await this.verificationRepo.reactivateStudent({ profileId: profile.id });

    if (this.auditRepo) {
      try {
        await this.auditRepo.append({
          actorId: adminUserId,
          actionType: AuditActionType.STUDENT_REACTIVATED,
          targetEntity: 'StudentProfile',
          targetId: profile.id,
          reason: 'Administrator reactivated student account',
          newValue: { accountStatus: StudentAccountStatus.ACTIVE },
        });
      } catch {
        // Non-blocking audit
      }
    }

    if (this.prisma) {
      try {
        await this.prisma.notification.create({
          data: {
            userId: studentUserId,
            type: 'SYSTEM_ALERT',
            title: 'Account Reactivated',
            message: 'Your student account has been reactivated. You may now resume using campus dining services.',
            payload: { accountStatus: StudentAccountStatus.ACTIVE },
          },
        });
      } catch {
        // Non-blocking notification
      }
    }
  }

  private mapToStatusDto(verif: VerificationRecord): VerificationStatusDto {
    const eligibility = VerificationStateMachine.checkOrderingEligibility({
      userIsActive: verif.studentProfile.user.isActive,
      role: UserRole.STUDENT,
      accountStatus: verif.studentProfile.accountStatus,
      verificationStatus: verif.status,
    });

    const canSubmit = 
      verif.status === VerificationStatus.PENDING_SUBMISSION ||
      verif.status === VerificationStatus.REJECTED;

    return {
      status: verif.status,
      accountStatus: verif.studentProfile.accountStatus,
      isEligibleToOrder: eligibility.eligible,
      rejectionReasonCode: verif.rejectionReasonCode,
      rejectionReason: verif.rejectionReason,
      submittedAt: verif.submittedAt,
      reviewedAt: verif.reviewedAt,
      canSubmitDocument: canSubmit,
      document: verif.identityDocument
        ? {
            id: verif.identityDocument.id,
            documentType: verif.identityDocument.documentType,
            originalFilename: verif.identityDocument.originalFilename,
            fileMimeType: verif.identityDocument.fileMimeType,
            fileSizeBytes: verif.identityDocument.fileSizeBytes,
            createdAt: verif.identityDocument.createdAt,
          }
        : null,
    };
  }
}
