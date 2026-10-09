import { describe, test, expect, jest, beforeAll, afterAll } from '@jest/globals';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { LivenessVerificationService } from '../../src/modules/identity/application/LivenessVerificationService.js';
import { MockLivenessVerificationProvider } from '../../src/modules/identity/domain/LivenessVerificationProvider.js';
import { IStorageProvider } from '../../src/modules/identity/domain/StorageProvider.js';
import { PrismaService } from '../../src/shared/infrastructure/PrismaService.js';
import { 
  UserRole, 
  StudentAccountStatus, 
  VerificationStatus,
  LivenessSessionStatus 
} from '../../src/modules/identity/domain/IdentityEnums.js';

describe('Liveness Verification Compensating Storage Cleanup', () => {
  const prisma = PrismaService.getClient();
  let studentId: string;
  let verificationId: string;
  let sessionId: string;
  let sessionNonce: string;
  const timestamp = Date.now();

  beforeAll(async () => {
    studentId = crypto.randomUUID();
    const profileId = crypto.randomUUID();
    verificationId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash('Password123!', 10);

    await prisma.user.create({
      data: {
        id: studentId,
        email: `storage_comp_${timestamp}@campus.edu`,
        phoneNumber: `+919923${timestamp.toString().slice(-6)}`,
        passwordHash,
        role: UserRole.STUDENT,
        isActive: true,
        studentProfile: {
          create: {
            id: profileId,
            fullName: 'Compensating Tester',
            universityRegNumber: `REG-COMP-${timestamp}`,
            accountStatus: StudentAccountStatus.PENDING_VERIFICATION,
            verifications: {
              create: {
                id: verificationId,
                status: VerificationStatus.UNDER_REVIEW,
                submittedAt: new Date(),
              },
            },
          },
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('invokes storage delete compensation when database transaction fails after upload', async () => {
    const deletedPaths: string[] = [];
    const mockStorage: IStorageProvider = {
      uploadFile: jest.fn().mockImplementation(async (_buf, filename, mime, _owner) => ({
        storagePath: `uploads/test/${filename}`,
        fileSizeBytes: 1024,
        mimeType: mime,
      })) as any,
      deleteFile: jest.fn().mockImplementation(async (path: string) => {
        deletedPaths.push(path);
      }) as any,
      getSignedUrl: jest.fn() as any,
      verifySignedUrlToken: jest.fn() as any,
      getSignedFile: jest.fn() as any,
      fileExists: jest.fn() as any,
      getFileMetadata: jest.fn() as any,
    };

    const livenessProvider = new MockLivenessVerificationProvider('test');
    const service = new LivenessVerificationService(prisma, mockStorage, livenessProvider);

    // Create session
    const session = await service.createSession(studentId);
    sessionId = session.sessionId;
    sessionNonce = session.sessionNonce;

    // Simulate DB transaction failure by intercepting prisma.$transaction
    const originalTransaction = prisma.$transaction.bind(prisma);
    const transactionSpy = jest.spyOn(prisma, '$transaction').mockImplementationOnce(async () => {
      throw new Error('SIMULATED_DB_CRASH_POST_STORAGE');
    });

    const ebmlHeader = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
    const videoBuffer = Buffer.concat([ebmlHeader, Buffer.from('VALID_VIDEO_STREAM')]);

    await expect(
      service.verifyLiveness({
        studentUserId: studentId,
        sessionId,
        sessionNonce,
        fileBuffer: videoBuffer,
        originalFilename: 'liveness.webm',
      })
    ).rejects.toThrow('SIMULATED_DB_CRASH_POST_STORAGE');

    // Verify storage cleanup compensation was executed
    expect(mockStorage.deleteFile).toHaveBeenCalledTimes(1);
    expect(deletedPaths).toHaveLength(1);
    expect(deletedPaths[0]).toMatch(/^uploads\/test\/liveness_/);

    transactionSpy.mockRestore();
  });
});
