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
import { StallStatus, OrderProcessingMode } from '../../src/modules/stall/domain/StallEnums.js';

describe('Admin Verification Queue, Approval, Rejection & Account Lifecycle API', () => {
  const app = createApp();
  const prisma = PrismaService.getClient();

  const timestamp = Date.now();

  let adminToken: string;
  let adminId: string;

  let studentAToken: string;
  let studentAId: string;
  let studentAProfileId: string;
  let studentAVerificationId: string;

  let studentBToken: string;
  let studentBId: string;
  let studentBProfileId: string;
  let studentBVerificationId: string;

  let stallId: string;
  let menuItemId: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('Password123!', 10);

    // 1. Admin
    adminId = crypto.randomUUID();
    await prisma.user.create({
      data: {
        id: adminId,
        email: `admin_${timestamp}@campus.edu`,
        phoneNumber: `+919911${timestamp.toString().slice(-6)}`,
        passwordHash,
        role: UserRole.ADMIN,
        isActive: true,
      },
    });
    adminToken = TokenService.generateTokens({ userId: adminId, role: UserRole.ADMIN, email: `admin_${timestamp}@campus.edu` }).accessToken;

    // 2. Student A (will be submitted and approved)
    studentAId = crypto.randomUUID();
    studentAProfileId = crypto.randomUUID();
    studentAVerificationId = crypto.randomUUID();

    await prisma.user.create({
      data: {
        id: studentAId,
        email: `alice_${timestamp}@campus.edu`,
        phoneNumber: `+919912${timestamp.toString().slice(-6)}`,
        passwordHash,
        role: UserRole.STUDENT,
        isActive: true,
        studentProfile: {
          create: {
            id: studentAProfileId,
            fullName: 'Alice Verified',
            universityRegNumber: `REG-VERIF-A-${timestamp}`,
            accountStatus: StudentAccountStatus.PENDING_VERIFICATION,
            verifications: {
              create: {
                id: studentAVerificationId,
                status: VerificationStatus.UNDER_REVIEW,
                submittedAt: new Date(),
                identityDocument: {
                  create: {
                    documentType: 'UNIVERSITY_ID_CARD',
                    fileStoragePath: 'id_doc_alice.pdf',
                    fileMimeType: 'application/pdf',
                    fileSizeBytes: 1024,
                    fileSha256Checksum: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
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
                    evidenceStoragePath: 'liveness_alice.webm',
                  },
                },
              },
            },
          },
        },
      },
    });
    studentAToken = TokenService.generateTokens({ userId: studentAId, role: UserRole.STUDENT, email: `alice_${timestamp}@campus.edu` }).accessToken;

    // 3. Student B (will be submitted and rejected)
    studentBId = crypto.randomUUID();
    studentBProfileId = crypto.randomUUID();
    studentBVerificationId = crypto.randomUUID();

    await prisma.user.create({
      data: {
        id: studentBId,
        email: `bob_${timestamp}@campus.edu`,
        phoneNumber: `+919913${timestamp.toString().slice(-6)}`,
        passwordHash,
        role: UserRole.STUDENT,
        isActive: true,
        studentProfile: {
          create: {
            id: studentBProfileId,
            fullName: 'Bob Rejectable',
            universityRegNumber: `REG-VERIF-B-${timestamp}`,
            accountStatus: StudentAccountStatus.PENDING_VERIFICATION,
            verifications: {
              create: {
                id: studentBVerificationId,
                status: VerificationStatus.UNDER_REVIEW,
                submittedAt: new Date(),
                identityDocument: {
                  create: {
                    documentType: 'UNIVERSITY_ID_CARD',
                    fileStoragePath: 'id_doc_bob.pdf',
                    fileMimeType: 'application/pdf',
                    fileSizeBytes: 2048,
                    fileSha256Checksum: '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff',
                  },
                },
              },
            },
          },
        },
      },
    });
    studentBToken = TokenService.generateTokens({ userId: studentBId, role: UserRole.STUDENT, email: `bob_${timestamp}@campus.edu` }).accessToken;

    // 4. Setup Stall and Menu item for Checkout verification test
    const ownerId = crypto.randomUUID();
    await prisma.user.create({
      data: {
        id: ownerId,
        email: `stall_owner_${timestamp}@campus.edu`,
        phoneNumber: `+919914${timestamp.toString().slice(-6)}`,
        passwordHash,
        role: UserRole.STALL_OWNER,
        isActive: true,
      },
    });

    stallId = crypto.randomUUID();
    await prisma.stall.create({
      data: {
        id: stallId,
        ownerId,
        name: `Lifecycle Stall ${timestamp}`,
        campusBlock: 'Block Central',
        liveStatus: StallStatus.OPEN,
        processingMode: OrderProcessingMode.AUTOMATIC,
        isApproved: true,
        operatingHours: {
          createMany: {
            data: [0, 1, 2, 3, 4, 5, 6].map(d => ({
              dayOfWeek: d,
              openTime: '00:00',
              closeTime: '23:59',
              isClosed: false,
            })),
          },
        },
        capacity: {
          create: {
            maxActiveOrders: 10,
            parallelPreparationLimit: 2,
            operationalBufferMinutes: 2,
          },
        },
      },
    });

    menuItemId = crypto.randomUUID();
    await prisma.menuItem.create({
      data: {
        id: menuItemId,
        stallId,
        name: 'Veg Puff',
        category: 'Snacks',
        price: 30.00,
        preparationTimeMinutes: 5,
        inventory: {
          create: {
            availableQuantity: 50,
            reservedQuantity: 0,
          },
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/v1/admin/verifications (Review Queue)', () => {
    test('admin can retrieve paginated verification review queue with status filter', async () => {
      const res = await request(app)
        .get('/api/v1/admin/verifications?status=UNDER_REVIEW')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toBeDefined();

      const foundA = res.body.data.find((v: any) => v.id === studentAVerificationId);
      expect(foundA).toBeDefined();
      expect(foundA.status).toBe(VerificationStatus.UNDER_REVIEW);
      expect(foundA.studentName).toBe('Alice Verified');
      expect(foundA.document.fileMimeType).toBe('application/pdf');
    });

    test('students are strictly forbidden from accessing admin verification queue (403)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/verifications')
        .set('Authorization', `Bearer ${studentAToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/admin/verifications/:id/document/url (Admin Document Inspection)', () => {
    test('admin can retrieve temporary signed URL to review student document and logs audit', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/verifications/${studentAVerificationId}/document/url`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.url).toContain('/api/v1/storage/documents/download?');

      // Verify audit log for administrative document access
      const audit = await prisma.auditLog.findFirst({
        where: { actorId: adminId, actionType: 'STUDENT_DOCUMENT_ACCESSED' },
      });
      expect(audit).not.toBeNull();
    });
  });

  describe('POST /api/v1/admin/verifications/:id/approve (Approval & Ordering Unlock)', () => {
    test('before approval, student is blocked from placing orders (403 UNVERIFIED_STUDENT)', async () => {
      const res = await request(app)
        .post('/api/v1/orders/checkout')
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({
          advancePercentage: 50,
          items: [{ menuItemId, quantity: 1 }],
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('admin approves verification: transitions state to ACTIVE and generates notification & audit', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/verifications/${studentAVerificationId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(VerificationStatus.ACTIVE);
      expect(res.body.data.accountStatus).toBe(StudentAccountStatus.ACTIVE);
      expect(res.body.data.isEligibleToOrder).toBe(true);

      // Verify DB record
      const dbProfile = await prisma.studentProfile.findUnique({ where: { id: studentAProfileId } });
      expect(dbProfile?.accountStatus).toBe(StudentAccountStatus.ACTIVE);

      // Verify audit log
      const audit = await prisma.auditLog.findFirst({
        where: { targetId: studentAVerificationId, actionType: 'VERIFICATION_APPROVED' },
      });
      expect(audit).not.toBeNull();
    });

    test('after approval, student can immediately checkout successfully (ordering unlocked)', async () => {
      const res = await request(app)
        .post('/api/v1/orders/checkout')
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({
          advancePercentage: 50,
          items: [{ menuItemId, quantity: 1 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.masterOrderId).toBeDefined();
    });
  });

  describe('POST /api/v1/admin/verifications/:id/reject (Rejection with Structured Reason)', () => {
    test('rejects request if structured reasonCode is missing (400)', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/verifications/${studentBVerificationId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('admin rejects verification with reasonCode INVALID_DOCUMENT: transitions to REJECTED', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/verifications/${studentBVerificationId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reasonCode: VerificationRejectionReason.INVALID_DOCUMENT,
          notes: 'Expired ID card. Please upload current semester enrollment card.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(VerificationStatus.REJECTED);
      expect(res.body.data.accountStatus).toBe(StudentAccountStatus.REJECTED);
      expect(res.body.data.rejectionReasonCode).toBe(VerificationRejectionReason.INVALID_DOCUMENT);
      expect(res.body.data.isEligibleToOrder).toBe(false);

      // Verify rejection notification for Student B
      const notif = await prisma.notification.findFirst({
        where: { userId: studentBId, type: 'VERIFICATION_UPDATE' },
      });
      expect(notif).not.toBeNull();
      expect(notif?.message).toContain('INVALID_DOCUMENT');
    });

    test('rejected student remains blocked from placing orders', async () => {
      const res = await request(app)
        .post('/api/v1/orders/checkout')
        .set('Authorization', `Bearer ${studentBToken}`)
        .send({
          advancePercentage: 50,
          items: [{ menuItemId, quantity: 1 }],
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Administrative Suspension & Reactivation Lifecycle', () => {
    test('admin suspends Student A: accountStatus transitions to SUSPENDED', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/students/${studentAId}/suspend`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Disciplinary suspension following dining hall policy breach' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbProfile = await prisma.studentProfile.findUnique({ where: { id: studentAProfileId } });
      expect(dbProfile?.accountStatus).toBe(StudentAccountStatus.SUSPENDED);
    });

    test('suspended student checkout is immediately blocked server-side (403)', async () => {
      const res = await request(app)
        .post('/api/v1/orders/checkout')
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({
          advancePercentage: 50,
          items: [{ menuItemId, quantity: 1 }],
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('admin reactivates Student A: transitions back to ACTIVE', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/students/${studentAId}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const dbProfile = await prisma.studentProfile.findUnique({ where: { id: studentAProfileId } });
      expect(dbProfile?.accountStatus).toBe(StudentAccountStatus.ACTIVE);
    });

    test('reactivated verified student can order again', async () => {
      const res = await request(app)
        .post('/api/v1/orders/checkout')
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({
          advancePercentage: 50,
          items: [{ menuItemId, quantity: 1 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });
  });
});
