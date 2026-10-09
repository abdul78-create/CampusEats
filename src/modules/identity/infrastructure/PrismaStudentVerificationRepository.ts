import { PrismaClient, VerificationStatus as PrismaVerificationStatus, StudentAccountStatus as PrismaStudentAccountStatus } from '@prisma/client';
import { 
  IStudentVerificationRepository, 
  VerificationRecord, 
  DocumentSubmissionData, 
  ListVerificationsParams 
} from '../domain/IStudentVerificationRepository.js';
import { 
  VerificationStatus, 
  StudentAccountStatus, 
  VerificationRejectionReason 
} from '../domain/IdentityEnums.js';
import { ConflictError, NotFoundError } from '../../../shared/errors/DomainErrors.js';
import { VerificationStateMachine } from '../domain/VerificationStateMachine.js';

export class PrismaStudentVerificationRepository implements IStudentVerificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findProfileByUserId(userId: string) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phoneNumber: true,
            isActive: true,
          },
        },
      },
    });

    if (!profile) return null;

    return {
      id: profile.id,
      userId: profile.userId,
      fullName: profile.fullName,
      universityRegNumber: profile.universityRegNumber,
      accountStatus: profile.accountStatus as StudentAccountStatus,
      user: profile.user,
    };
  }

  async findProfileById(profileId: string) {
    const profile = await this.prisma.studentProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile) return null;

    return {
      id: profile.id,
      userId: profile.userId,
      fullName: profile.fullName,
      universityRegNumber: profile.universityRegNumber,
      accountStatus: profile.accountStatus as StudentAccountStatus,
    };
  }

  async findLatestVerificationByProfileId(profileId: string): Promise<VerificationRecord | null> {
    const raw = await this.prisma.studentVerification.findFirst({
      where: { studentProfileId: profileId },
      orderBy: { createdAt: 'desc' },
      include: {
        studentProfile: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                phoneNumber: true,
                isActive: true,
              },
            },
          },
        },
        identityDocument: true,
        livenessVerification: true,
      },
    });

    if (!raw) return null;

    return this.mapToRecord(raw);
  }

  async findVerificationById(verificationId: string): Promise<VerificationRecord | null> {
    const raw = await this.prisma.studentVerification.findUnique({
      where: { id: verificationId },
      include: {
        studentProfile: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                phoneNumber: true,
                isActive: true,
              },
            },
          },
        },
        identityDocument: true,
        livenessVerification: true,
      },
    });

    if (!raw) return null;

    return this.mapToRecord(raw);
  }

  async submitIdentityDocument(data: DocumentSubmissionData): Promise<VerificationRecord> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Lock the student profile row for update to serialize concurrent submissions
      await tx.$queryRaw`SELECT id FROM "StudentProfile" WHERE id = ${data.studentProfileId} FOR UPDATE`;

      const profile = await tx.studentProfile.findUnique({
        where: { id: data.studentProfileId },
        include: { verifications: { orderBy: { createdAt: 'desc' }, take: 1 } },
      });

      if (!profile) {
        throw new NotFoundError(`Student profile not found: ${data.studentProfileId}`);
      }

      const latestVerif = profile.verifications[0];
      if (latestVerif) {
        if (latestVerif.status === VerificationStatus.ACTIVE) {
          throw new ConflictError('Student identity is already verified and active. Re-submission is not permitted.');
        }
      }

      // 2. Upsert verification record into UNDER_REVIEW
      let verificationId = data.verificationId;
      if (latestVerif && (latestVerif.status === VerificationStatus.PENDING_SUBMISSION || latestVerif.status === VerificationStatus.REJECTED)) {
        verificationId = latestVerif.id;
        await tx.studentVerification.update({
          where: { id: verificationId },
          data: {
            status: PrismaVerificationStatus.UNDER_REVIEW,
            submittedAt: new Date(),
            rejectionReason: null,
            rejectionReasonCode: null,
            reviewedByAdminId: null,
            reviewedAt: null,
          },
        });
      } else {
        const created = await tx.studentVerification.create({
          data: {
            id: verificationId,
            studentProfileId: data.studentProfileId,
            status: PrismaVerificationStatus.UNDER_REVIEW,
            submittedAt: new Date(),
          },
        });
        verificationId = created.id;
      }

      // 3. Upsert IdentityDocument record (store metadata only - raw bytes are in object storage)
      await tx.identityDocument.upsert({
        where: { verificationId },
        create: {
          verificationId,
          documentType: data.documentType,
          originalFilename: data.originalFilename,
          fileStoragePath: data.fileStoragePath,
          fileMimeType: data.fileMimeType,
          fileSizeBytes: data.fileSizeBytes,
          fileSha256Checksum: data.fileSha256Checksum,
        },
        update: {
          documentType: data.documentType,
          originalFilename: data.originalFilename,
          fileStoragePath: data.fileStoragePath,
          fileMimeType: data.fileMimeType,
          fileSizeBytes: data.fileSizeBytes,
          fileSha256Checksum: data.fileSha256Checksum,
          createdAt: new Date(),
        },
      });

      // 4. Update profile status to PENDING_VERIFICATION
      await tx.studentProfile.update({
        where: { id: data.studentProfileId },
        data: { accountStatus: PrismaStudentAccountStatus.PENDING_VERIFICATION },
      });

      const updated = await tx.studentVerification.findUnique({
        where: { id: verificationId },
        include: {
          studentProfile: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  phoneNumber: true,
                  isActive: true,
                },
              },
            },
          },
          identityDocument: true,
        },
      });

      return this.mapToRecord(updated!);
    });
  }

  async approveVerification(params: {
    verificationId: string;
    adminId: string;
    reviewedAt: Date;
  }): Promise<VerificationRecord> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Acquire row lock on StudentVerification to serialize concurrent review decisions
      await tx.$queryRaw`SELECT id FROM "StudentVerification" WHERE id = ${params.verificationId} FOR UPDATE`;

      const current = await tx.studentVerification.findUnique({
        where: { id: params.verificationId },
      });

      if (!current) {
        throw new NotFoundError(`Verification record not found: ${params.verificationId}`);
      }

      // Assert transition is valid
      VerificationStateMachine.assertValidTransition(
        current.status as VerificationStatus,
        VerificationStatus.ACTIVE
      );

      // 2. Update student profile account status to ACTIVE first
      await tx.studentProfile.update({
        where: { id: current.studentProfileId },
        data: { accountStatus: PrismaStudentAccountStatus.ACTIVE },
      });

      // 3. Transition verification to ACTIVE and include updated profile
      const updated = await tx.studentVerification.update({
        where: { id: params.verificationId },
        data: {
          status: PrismaVerificationStatus.ACTIVE,
          reviewedByAdminId: params.adminId,
          reviewedAt: params.reviewedAt,
          rejectionReason: null,
          rejectionReasonCode: null,
        },
        include: {
          studentProfile: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  phoneNumber: true,
                  isActive: true,
                },
              },
            },
          },
          identityDocument: true,
        },
      });

      return this.mapToRecord(updated);
    });
  }

  async rejectVerification(params: {
    verificationId: string;
    adminId: string;
    reasonCode: VerificationRejectionReason;
    notes?: string;
    reviewedAt: Date;
  }): Promise<VerificationRecord> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Acquire row lock on StudentVerification to serialize concurrent decisions
      await tx.$queryRaw`SELECT id FROM "StudentVerification" WHERE id = ${params.verificationId} FOR UPDATE`;

      const current = await tx.studentVerification.findUnique({
        where: { id: params.verificationId },
      });

      if (!current) {
        throw new NotFoundError(`Verification record not found: ${params.verificationId}`);
      }

      // Assert transition is valid
      VerificationStateMachine.assertValidTransition(
        current.status as VerificationStatus,
        VerificationStatus.REJECTED
      );

      // 2. Update student profile account status to REJECTED first
      await tx.studentProfile.update({
        where: { id: current.studentProfileId },
        data: { accountStatus: PrismaStudentAccountStatus.REJECTED },
      });

      // 3. Transition verification to REJECTED and include updated profile
      const updated = await tx.studentVerification.update({
        where: { id: params.verificationId },
        data: {
          status: PrismaVerificationStatus.REJECTED,
          rejectionReasonCode: params.reasonCode,
          rejectionReason: params.notes || `Verification rejected: ${params.reasonCode}`,
          reviewedByAdminId: params.adminId,
          reviewedAt: params.reviewedAt,
        },
        include: {
          studentProfile: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  phoneNumber: true,
                  isActive: true,
                },
              },
            },
          },
          identityDocument: true,
        },
      });

      return this.mapToRecord(updated);
    });
  }

  async suspendStudent(params: {
    profileId: string;
    verificationId?: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "StudentProfile" WHERE id = ${params.profileId} FOR UPDATE`;

      await tx.studentProfile.update({
        where: { id: params.profileId },
        data: { accountStatus: PrismaStudentAccountStatus.SUSPENDED },
      });

      // If verification exists, transition verification to SUSPENDED as well
      const verif = await tx.studentVerification.findFirst({
        where: { studentProfileId: params.profileId },
        orderBy: { createdAt: 'desc' },
      });

      if (verif) {
        await tx.studentVerification.update({
          where: { id: verif.id },
          data: { status: PrismaVerificationStatus.SUSPENDED },
        });
      }
    });
  }

  async reactivateStudent(params: {
    profileId: string;
    verificationId?: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "StudentProfile" WHERE id = ${params.profileId} FOR UPDATE`;

      const profile = await tx.studentProfile.findUnique({
        where: { id: params.profileId },
        include: { verifications: { orderBy: { createdAt: 'desc' }, take: 1 } },
      });

      if (!profile) {
        throw new NotFoundError(`Student profile not found: ${params.profileId}`);
      }

      const verif = profile.verifications[0];
      // Reactivation requires prior verified status
      if (!verif || (verif.status !== VerificationStatus.SUSPENDED && verif.status !== VerificationStatus.ACTIVE)) {
        throw new ConflictError(
          'Cannot reactivate student without a prior approved verification. Student must complete verification.'
        );
      }

      await tx.studentProfile.update({
        where: { id: params.profileId },
        data: { accountStatus: PrismaStudentAccountStatus.ACTIVE },
      });

      await tx.studentVerification.update({
        where: { id: verif.id },
        data: { status: PrismaVerificationStatus.ACTIVE },
      });
    });
  }

  async listVerifications(params: ListVerificationsParams): Promise<{
    records: VerificationRecord[];
    total: number;
  }> {
    const whereClause: any = {};
    if (params.status) {
      whereClause.status = params.status;
    }

    const [rawList, total] = await Promise.all([
      this.prisma.studentVerification.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip: params.skip || 0,
        take: params.take || 20,
        include: {
          studentProfile: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  phoneNumber: true,
                  isActive: true,
                },
              },
            },
          },
          identityDocument: true,
          livenessVerification: true,
        },
      }),
      this.prisma.studentVerification.count({ where: whereClause }),
    ]);

    return {
      records: rawList.map((r) => this.mapToRecord(r)),
      total,
    };
  }

  private mapToRecord(raw: any): VerificationRecord {
    return {
      id: raw.id,
      studentProfileId: raw.studentProfileId,
      status: raw.status as VerificationStatus,
      rejectionReasonCode: raw.rejectionReasonCode as VerificationRejectionReason | null,
      rejectionReason: raw.rejectionReason,
      reviewedByAdminId: raw.reviewedByAdminId,
      reviewedAt: raw.reviewedAt,
      submittedAt: raw.submittedAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      studentProfile: {
        id: raw.studentProfile.id,
        userId: raw.studentProfile.userId,
        fullName: raw.studentProfile.fullName,
        universityRegNumber: raw.studentProfile.universityRegNumber,
        accountStatus: raw.studentProfile.accountStatus as StudentAccountStatus,
        user: raw.studentProfile.user,
      },
      identityDocument: raw.identityDocument
        ? {
            id: raw.identityDocument.id,
            verificationId: raw.identityDocument.verificationId,
            documentType: raw.identityDocument.documentType,
            originalFilename: raw.identityDocument.originalFilename,
            fileStoragePath: raw.identityDocument.fileStoragePath,
            fileMimeType: raw.identityDocument.fileMimeType,
            fileSizeBytes: raw.identityDocument.fileSizeBytes,
            fileSha256Checksum: raw.identityDocument.fileSha256Checksum,
            createdAt: raw.identityDocument.createdAt,
          }
        : null,
      livenessVerification: raw.livenessVerification
        ? {
            id: raw.livenessVerification.id,
            verificationId: raw.livenessVerification.verificationId,
            providerName: raw.livenessVerification.providerName,
            isLiveHuman: raw.livenessVerification.isLiveHuman,
            naturalBlinkPassed: raw.livenessVerification.naturalBlinkPassed,
            headTurnLeftPassed: raw.livenessVerification.headTurnLeftPassed,
            headTurnRightPassed: raw.livenessVerification.headTurnRightPassed,
            confidenceScore: raw.livenessVerification.confidenceScore,
            verifiedAt: raw.livenessVerification.verifiedAt,
          }
        : null,
    };
  }
}
