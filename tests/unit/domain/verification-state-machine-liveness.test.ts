import { describe, test, expect, jest } from '@jest/globals';
import { StudentVerificationService } from '../../../src/modules/identity/application/StudentVerificationService.js';
import { 
  VerificationStatus, 
  StudentAccountStatus, 
  UserRole 
} from '../../../src/modules/identity/domain/IdentityEnums.js';
import { ValidationError, NotFoundError } from '../../../src/shared/errors/DomainErrors.js';
import { IStudentVerificationRepository } from '../../../src/modules/identity/domain/IStudentVerificationRepository.js';
import { IStorageProvider } from '../../../src/modules/identity/domain/StorageProvider.js';

describe('Verification State Machine & Liveness Dual-Prerequisite Invariant', () => {
  const mockStorage: IStorageProvider = {
    uploadFile: jest.fn(),
    getSignedUrl: jest.fn(),
    verifySignedUrlToken: jest.fn(),
    getSignedFile: jest.fn(),
    deleteFile: jest.fn(),
    fileExists: jest.fn(),
    getFileMetadata: jest.fn(),
  };

  const createMockRepo = (verificationRecord: any): IStudentVerificationRepository => ({
    findProfileByUserId: jest.fn(),
    findLatestVerificationByProfileId: jest.fn(),
    findVerificationById: jest.fn().mockImplementation(async () => verificationRecord) as any,
    createVerification: jest.fn(),
    approveVerification: jest.fn().mockImplementation(async () => ({
      ...verificationRecord,
      status: VerificationStatus.ACTIVE,
      studentProfile: {
        ...verificationRecord.studentProfile,
        accountStatus: StudentAccountStatus.ACTIVE,
      },
    })) as any,
    rejectVerification: jest.fn(),
    suspendStudent: jest.fn(),
    reactivateStudent: jest.fn(),
    listVerifications: jest.fn(),
    findDocumentById: jest.fn(),
  });

  const baseRecord = {
    id: 'verif-123',
    studentProfileId: 'profile-123',
    status: VerificationStatus.UNDER_REVIEW,
    rejectionReasonCode: null,
    rejectionReason: null,
    reviewedBy: null,
    submittedAt: new Date(),
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    studentProfile: {
      id: 'profile-123',
      userId: 'user-123',
      fullName: 'Alice Test',
      universityRegNumber: 'REG-123',
      accountStatus: StudentAccountStatus.PENDING_VERIFICATION,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: {
        id: 'user-123',
        email: 'alice@campus.edu',
        phoneNumber: '+919999999999',
        role: UserRole.STUDENT,
        isActive: true,
      },
    },
    identityDocument: null,
    livenessVerification: null,
  };

  describe('Administrative Approval Dual-Prerequisite Invariant', () => {
    test('throws NotFoundError if verification record does not exist', async () => {
      const repo = createMockRepo(null);
      const service = new StudentVerificationService(repo, mockStorage);

      await expect(
        service.approveVerification('admin-1', 'non-existent')
      ).rejects.toThrow(NotFoundError);
    });

    test('strictly rejects approval when identity document is missing (even if liveness passed)', async () => {
      const record = {
        ...baseRecord,
        identityDocument: null,
        livenessVerification: {
          isLiveHuman: true,
          confidenceScore: 0.95,
        },
      };

      const repo = createMockRepo(record);
      const service = new StudentVerificationService(repo, mockStorage);

      await expect(
        service.approveVerification('admin-1', record.id)
      ).rejects.toThrow(ValidationError);
      await expect(
        service.approveVerification('admin-1', record.id)
      ).rejects.toThrow('Identity document is missing');
    });

    test('strictly rejects approval when liveness verification is missing (even if document is uploaded)', async () => {
      const record = {
        ...baseRecord,
        identityDocument: {
          id: 'doc-1',
          fileStoragePath: 'docs/doc1.pdf',
        },
        livenessVerification: null,
      };

      const repo = createMockRepo(record);
      const service = new StudentVerificationService(repo, mockStorage);

      await expect(
        service.approveVerification('admin-1', record.id)
      ).rejects.toThrow(ValidationError);
      await expect(
        service.approveVerification('admin-1', record.id)
      ).rejects.toThrow('Active liveness verification is incomplete or failed');
    });

    test('strictly rejects approval when liveness verification is present but isLiveHuman is false (spoof/unverified)', async () => {
      const record = {
        ...baseRecord,
        identityDocument: {
          id: 'doc-1',
          fileStoragePath: 'docs/doc1.pdf',
        },
        livenessVerification: {
          isLiveHuman: false,
          confidenceScore: 0.40,
        },
      };

      const repo = createMockRepo(record);
      const service = new StudentVerificationService(repo, mockStorage);

      await expect(
        service.approveVerification('admin-1', record.id)
      ).rejects.toThrow(ValidationError);
      await expect(
        service.approveVerification('admin-1', record.id)
      ).rejects.toThrow('Active liveness verification is incomplete or failed');
    });

    test('successfully approves verification only when BOTH identity document and isLiveHuman === true are present', async () => {
      const record = {
        ...baseRecord,
        identityDocument: {
          id: 'doc-1',
          fileStoragePath: 'docs/doc1.pdf',
        },
        livenessVerification: {
          isLiveHuman: true,
          confidenceScore: 0.94,
        },
      };

      const repo = createMockRepo(record);
      const service = new StudentVerificationService(repo, mockStorage);

      const result = await service.approveVerification('admin-1', record.id);
      expect(result.status).toBe(VerificationStatus.ACTIVE);
      expect(result.accountStatus).toBe(StudentAccountStatus.ACTIVE);
      expect(result.isEligibleToOrder).toBe(true);
      expect(repo.approveVerification).toHaveBeenCalledWith(
        expect.objectContaining({
          verificationId: record.id,
          adminId: 'admin-1',
        })
      );
    });
  });
});
