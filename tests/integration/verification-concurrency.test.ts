import request from 'supertest';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/app.js';
import { PrismaService } from '../../src/shared/infrastructure/PrismaService.js';
import { TokenService } from '../../src/modules/identity/domain/TokenService.js';
import { 
  UserRole, 
  StudentAccountStatus, 
  VerificationStatus,
  VerificationRejectionReason 
} from '../../src/modules/identity/domain/IdentityEnums.js';

describe('Verification Concurrency, Locking & State Safety (Section Z)', () => {
  const app = createApp();
  const prisma = PrismaService.getClient();

  const timestamp = Date.now();

  let admin1Token: string;
  let admin1Id: string;
  let admin2Token: string;
  let admin2Id: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('Password123!', 10);

    admin1Id = crypto.randomUUID();
    admin2Id = crypto.randomUUID();

    await prisma.user.createMany({
      data: [
        {
          id: admin1Id,
          email: `admin1_${timestamp}@campus.edu`,
          phoneNumber: `+919711${timestamp.toString().slice(-6)}`,
          passwordHash,
          role: UserRole.ADMIN,
          isActive: true,
        },
        {
          id: admin2Id,
          email: `admin2_${timestamp}@campus.edu`,
          phoneNumber: `+919712${timestamp.toString().slice(-6)}`,
          passwordHash,
          role: UserRole.ADMIN,
          isActive: true,
        },
      ],
    });

    admin1Token = TokenService.generateTokens({ userId: admin1Id, role: UserRole.ADMIN, email: `admin1_${timestamp}@campus.edu` }).accessToken;
    admin2Token = TokenService.generateTokens({ userId: admin2Id, role: UserRole.ADMIN, email: `admin2_${timestamp}@campus.edu` }).accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('CONCURRENCY: Two admins approving the same verification simultaneously allow exactly 1 success and reject the other with 409 Conflict', async () => {
    const passwordHash = await bcrypt.hash('Password123!', 10);
    const studentId = crypto.randomUUID();
    const verifId = crypto.randomUUID();

    await prisma.user.create({
      data: {
        id: studentId,
        email: `concur_appr_${timestamp}@campus.edu`,
        phoneNumber: `+919713${timestamp.toString().slice(-6)}`,
        passwordHash,
        role: UserRole.STUDENT,
        isActive: true,
        studentProfile: {
          create: {
            fullName: 'Concurrent Student',
            universityRegNumber: `REG-CONC-1-${timestamp}`,
            accountStatus: StudentAccountStatus.PENDING_VERIFICATION,
            verifications: {
              create: {
                id: verifId,
                status: VerificationStatus.UNDER_REVIEW,
                submittedAt: new Date(),
                identityDocument: {
                  create: {
                    documentType: 'UNIVERSITY_ID_CARD',
                    fileStoragePath: 'id_doc_conc1.pdf',
                    fileMimeType: 'application/pdf',
                    fileSizeBytes: 1024,
                    fileSha256Checksum: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456789011',
                  },
                },
                livenessVerification: {
                  create: {
                    providerName: 'mock',
                    isLiveHuman: true,
                    naturalBlinkPassed: true,
                    headTurnLeftPassed: true,
                    headTurnRightPassed: true,
                    confidenceScore: 0.95,
                    evidenceStoragePath: 'liveness_conc1.webm',
                  },
                },
              },
            },
          },
        },
      },
    });

    // Both Admin 1 and Admin 2 submit approval requests concurrently
    const [res1, res2] = await Promise.all([
      request(app)
        .post(`/api/v1/admin/verifications/${verifId}/approve`)
        .set('Authorization', `Bearer ${admin1Token}`),
      request(app)
        .post(`/api/v1/admin/verifications/${verifId}/approve`)
        .set('Authorization', `Bearer ${admin2Token}`),
    ]);

    const statuses = [res1.status, res2.status];
    expect(statuses).toContain(200);
    expect(statuses).toContain(409);

    // Verify database row is in ACTIVE state with exactly one winner
    const dbVerif = await prisma.studentVerification.findUnique({ where: { id: verifId } });
    expect(dbVerif?.status).toBe(VerificationStatus.ACTIVE);
  });

  test('CONCURRENCY: Admin 1 approves while Admin 2 rejects simultaneously: exactly 1 wins and state remains valid', async () => {
    const passwordHash = await bcrypt.hash('Password123!', 10);
    const studentId = crypto.randomUUID();
    const verifId = crypto.randomUUID();

    await prisma.user.create({
      data: {
        id: studentId,
        email: `concur_race_${timestamp}@campus.edu`,
        phoneNumber: `+919714${timestamp.toString().slice(-6)}`,
        passwordHash,
        role: UserRole.STUDENT,
        isActive: true,
        studentProfile: {
          create: {
            fullName: 'Race Student',
            universityRegNumber: `REG-CONC-2-${timestamp}`,
            accountStatus: StudentAccountStatus.PENDING_VERIFICATION,
            verifications: {
              create: {
                id: verifId,
                status: VerificationStatus.UNDER_REVIEW,
                submittedAt: new Date(),
                identityDocument: {
                  create: {
                    documentType: 'UNIVERSITY_ID_CARD',
                    fileStoragePath: 'id_doc_conc2.pdf',
                    fileMimeType: 'application/pdf',
                    fileSizeBytes: 1024,
                    fileSha256Checksum: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456789022',
                  },
                },
                livenessVerification: {
                  create: {
                    providerName: 'mock',
                    isLiveHuman: true,
                    naturalBlinkPassed: true,
                    headTurnLeftPassed: true,
                    headTurnRightPassed: true,
                    confidenceScore: 0.95,
                    evidenceStoragePath: 'liveness_conc2.webm',
                  },
                },
              },
            },
          },
        },
      },
    });

    const [resApprove, resReject] = await Promise.all([
      request(app)
        .post(`/api/v1/admin/verifications/${verifId}/approve`)
        .set('Authorization', `Bearer ${admin1Token}`),
      request(app)
        .post(`/api/v1/admin/verifications/${verifId}/reject`)
        .set('Authorization', `Bearer ${admin2Token}`)
        .send({ reasonCode: VerificationRejectionReason.DOCUMENT_UNREADABLE }),
    ]);

    const statuses = [resApprove.status, resReject.status];
    expect(statuses).toContain(200);
    expect(statuses).toContain(409);

    const dbVerif = await prisma.studentVerification.findUnique({ where: { id: verifId } });
    expect([VerificationStatus.ACTIVE, VerificationStatus.REJECTED]).toContain(dbVerif?.status);
  });

  test('CONCURRENCY: Concurrent document submissions from same student serialize cleanly without state corruption', async () => {
    const passwordHash = await bcrypt.hash('Password123!', 10);
    const studentId = crypto.randomUUID();

    await prisma.user.create({
      data: {
        id: studentId,
        email: `concur_subm_${timestamp}@campus.edu`,
        phoneNumber: `+919715${timestamp.toString().slice(-6)}`,
        passwordHash,
        role: UserRole.STUDENT,
        isActive: true,
        studentProfile: {
          create: {
            fullName: 'Submitter Student',
            universityRegNumber: `REG-CONC-3-${timestamp}`,
            accountStatus: StudentAccountStatus.PENDING_VERIFICATION,
          },
        },
      },
    });

    const studentToken = TokenService.generateTokens({ userId: studentId, role: UserRole.STUDENT, email: `concur_subm_${timestamp}@campus.edu` }).accessToken;
    const genuinePdf = Buffer.from('%PDF-1.4 sample content');

    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/v1/student/verification/document')
        .set('Authorization', `Bearer ${studentToken}`)
        .attach('document', genuinePdf, 'doc1.pdf'),
      request(app)
        .post('/api/v1/student/verification/document')
        .set('Authorization', `Bearer ${studentToken}`)
        .attach('document', genuinePdf, 'doc2.pdf'),
    ]);

    // Both should either succeed or one succeeds and second updates safely
    expect([201, 201]).toContain(res1.status);
    expect([201, 201]).toContain(res2.status);

    const verifs = await prisma.studentVerification.findMany({
      where: { studentProfile: { userId: studentId } },
    });
    expect(verifs.length).toBeGreaterThanOrEqual(1);
    expect(verifs.every(v => v.status === VerificationStatus.UNDER_REVIEW)).toBe(true);
  });
});
