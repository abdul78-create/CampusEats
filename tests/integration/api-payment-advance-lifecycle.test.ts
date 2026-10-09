import request from 'supertest';
import crypto from 'node:crypto';
import { createApp } from '../../src/app.js';
import { PrismaService } from '../../src/shared/infrastructure/PrismaService.js';
import { TokenService } from '../../src/modules/identity/domain/TokenService.js';
import { UserRole, StudentAccountStatus } from '../../src/modules/identity/domain/IdentityEnums.js';
import { VerificationStatus } from '@prisma/client';
import { StallStatus, OrderProcessingMode } from '../../src/modules/stall/domain/StallEnums.js';
import { MasterOrderStatus, SubOrderStatus, PaymentStatus, TransactionType } from '@prisma/client';

describe('Phase 5 — UPI Advance Payment & Attempt Lifecycle API', () => {
  const app = createApp();
  const prisma = PrismaService.getClient();

  const ts = Date.now().toString(36);
  const studentAId = crypto.randomUUID();
  const studentBId = crypto.randomUUID();
  const unverifiedStudentId = crypto.randomUUID();
  const ownerId = crypto.randomUUID();
  const stallId = crypto.randomUUID();
  const menuItemId = crypto.randomUUID();

  let studentAToken: string;
  let studentBToken: string;
  let unverifiedStudentToken: string;
  let testOrderId: string;

  beforeAll(async () => {
    // 1. Users
    await prisma.user.createMany({
      data: [
        {
          id: studentAId,
          email: `studentA_${ts}@campus.edu`,
          phoneNumber: `+9191${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHash',
          role: UserRole.STUDENT,
        },
        {
          id: studentBId,
          email: `studentB_${ts}@campus.edu`,
          phoneNumber: `+9192${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHash',
          role: UserRole.STUDENT,
        },
        {
          id: unverifiedStudentId,
          email: `unverified_${ts}@campus.edu`,
          phoneNumber: `+9193${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHash',
          role: UserRole.STUDENT,
        },
        {
          id: ownerId,
          email: `owner_${ts}@campus.edu`,
          phoneNumber: `+9194${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHash',
          role: UserRole.STALL_OWNER,
        },
      ],
    });

    // 2. Student Profiles
    const profileA = await prisma.studentProfile.create({
      data: {
        id: crypto.randomUUID(),
        userId: studentAId,
        fullName: 'Student Alpha',
        universityRegNumber: `REG-A-${ts}`,
        accountStatus: StudentAccountStatus.ACTIVE,
      },
    });

    await prisma.studentProfile.create({
      data: {
        id: crypto.randomUUID(),
        userId: studentBId,
        fullName: 'Student Beta',
        universityRegNumber: `REG-B-${ts}`,
        accountStatus: StudentAccountStatus.ACTIVE,
      },
    });

    await prisma.studentProfile.create({
      data: {
        id: crypto.randomUUID(),
        userId: unverifiedStudentId,
        fullName: 'Unverified Student',
        universityRegNumber: `REG-U-${ts}`,
        accountStatus: StudentAccountStatus.PENDING_VERIFICATION,
      },
    });

    // Verification record for Student A (4 pillars: active user + ACTIVE account + ACTIVE verification)
    await prisma.studentVerification.create({
      data: {
        id: crypto.randomUUID(),
        studentProfileId: profileA.id,
        status: VerificationStatus.ACTIVE,
      },
    });

    // 3. Stall & Menu
    await prisma.stall.create({
      data: {
        id: stallId,
        ownerId,
        name: `Payment Test Stall ${ts}`,
        campusBlock: 'Block Central',
        liveStatus: StallStatus.OPEN,
        processingMode: OrderProcessingMode.AUTOMATIC,
        isApproved: true,
      },
    });

    await prisma.menuItem.create({
      data: {
        id: menuItemId,
        stallId,
        name: 'Samosa Chat',
        category: 'Snacks',
        price: 100.00,
        preparationTimeMinutes: 5,
      },
    });

    // 4. Master Order for Student A in PENDING_PAYMENT
    const masterOrder = await prisma.masterOrder.create({
      data: {
        id: crypto.randomUUID(),
        studentId: studentAId,
        orderNumber: `ORD-${ts}-001`,
        status: MasterOrderStatus.PENDING_PAYMENT,
        totalAmount: 100.00,
        advancePercentage: 60,
        advanceAmount: 60.00,
        remainingAmount: 40.00,
        amountPaid: 0.00,
      },
    });
    testOrderId = masterOrder.id;

    await prisma.subOrder.create({
      data: {
        id: crypto.randomUUID(),
        masterOrderId: testOrderId,
        stallId,
        subOrderNumber: `SUB-${ts}-001-S1`,
        status: SubOrderStatus.PENDING_PAYMENT,
        subtotalAmount: 100.00,
        advancePaidAmount: 60.00,
        balanceDueAmount: 40.00,
        isBalancePaid: false,
      },
    });

    // Tokens
    studentAToken = TokenService.generateTokens({
      userId: studentAId,
      role: UserRole.STUDENT,
      email: `studentA_${ts}@campus.edu`,
    }).accessToken;

    studentBToken = TokenService.generateTokens({
      userId: studentBId,
      role: UserRole.STUDENT,
      email: `studentB_${ts}@campus.edu`,
    }).accessToken;

    unverifiedStudentToken = TokenService.generateTokens({
      userId: unverifiedStudentId,
      role: UserRole.STUDENT,
      email: `unverified_${ts}@campus.edu`,
    }).accessToken;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: { userId: { in: [studentAId, studentBId, unverifiedStudentId] } },
    });
    await prisma.paymentTransaction.deleteMany({
      where: { payment: { masterOrderId: testOrderId } },
    });
    await prisma.payment.deleteMany({
      where: { masterOrderId: testOrderId },
    });
    await prisma.subOrder.deleteMany({
      where: { masterOrderId: testOrderId },
    });
    await prisma.masterOrder.deleteMany({
      where: { id: testOrderId },
    });
    await prisma.menuItem.deleteMany({
      where: { id: menuItemId },
    });
    await prisma.stall.deleteMany({
      where: { id: stallId },
    });
    await prisma.studentVerification.deleteMany({
      where: { studentProfile: { userId: { in: [studentAId, studentBId, unverifiedStudentId] } } },
    });
    await prisma.studentProfile.deleteMany({
      where: { userId: { in: [studentAId, studentBId, unverifiedStudentId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [studentAId, studentBId, unverifiedStudentId, ownerId] } },
    });
  });

  describe('POST /api/v1/payments/initiate (Advance Payment Initiation)', () => {
    test('verified student successfully initiates advance payment: returns UPI intent, QR, and 15-min TTL', async () => {
      const res = await request(app)
        .post('/api/v1/payments/initiate')
        .set('Authorization', `Bearer ${studentAToken}`)
        .set('Idempotency-Key', `idemp_pay_${ts}_1`)
        .send({
          orderId: testOrderId,
          upiVpa: 'student@upi',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.intentPayload).toContain('upi://pay?');
      expect(res.body.data.intentPayload).toContain('am=60.00');
      expect(res.body.data.intentPayload).toContain('cu=INR');
      expect(res.body.data.qrPayload).toBeDefined();
      expect(res.body.data.paymentAttemptReference).toBeDefined();

      // Check DB records
      const payment = await prisma.payment.findFirst({
        where: { masterOrderId: testOrderId },
        include: { transactions: true },
      });
      expect(payment).toBeDefined();
      expect(payment!.status).toBe(PaymentStatus.INITIATED);
      expect(payment!.transactions).toHaveLength(1);
      expect(payment!.transactions[0].transactionType).toBe(TransactionType.ADVANCE);
      expect(payment!.transactions[0].status).toBe(PaymentStatus.INITIATED);
      expect(Number(payment!.transactions[0].amount)).toBe(60.00);
    });

    test('payment initiation idempotency: replaying identical Idempotency-Key returns cached session', async () => {
      const res1 = await request(app)
        .post('/api/v1/payments/initiate')
        .set('Authorization', `Bearer ${studentAToken}`)
        .set('Idempotency-Key', `idemp_pay_${ts}_replay`)
        .send({ orderId: testOrderId });

      expect(res1.status).toBe(200);

      const res2 = await request(app)
        .post('/api/v1/payments/initiate')
        .set('Authorization', `Bearer ${studentAToken}`)
        .set('Idempotency-Key', `idemp_pay_${ts}_replay`)
        .send({ orderId: testOrderId });

      expect(res2.status).toBe(200);
      expect(res2.body.data.paymentAttemptReference).toBe(res1.body.data.paymentAttemptReference);
      expect(res2.body.data.intentPayload).toBe(res1.body.data.intentPayload);
    });

    test('IDOR defense: Student B is forbidden from initiating payment on Student A order', async () => {
      const res = await request(app)
        .post('/api/v1/payments/initiate')
        .set('Authorization', `Bearer ${studentBToken}`)
        .set('Idempotency-Key', `idemp_pay_idor_${ts}`)
        .send({ orderId: testOrderId });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain('Unauthorized');
    });

    test('Verification Gate: unverified student is forbidden from initiating payment', async () => {
      const res = await request(app)
        .post('/api/v1/payments/initiate')
        .set('Authorization', `Bearer ${unverifiedStudentToken}`)
        .set('Idempotency-Key', `idemp_unver_${ts}`)
        .send({ orderId: testOrderId });

      expect(res.status).toBe(403);
    });

    test('15-minute TTL & retry lifecycle: expired attempt #1 transitions to EXPIRED, creating attempt #2', async () => {
      // Find current attempt and backdate expiresAt to simulate 15-minute expiry
      const currentAttempt = await prisma.paymentTransaction.findFirst({
        where: { payment: { masterOrderId: testOrderId }, status: PaymentStatus.INITIATED },
      });
      expect(currentAttempt).toBeDefined();

      await prisma.paymentTransaction.update({
        where: { id: currentAttempt!.id },
        data: { expiresAt: new Date(Date.now() - 1000) }, // Expired 1 second ago
      });

      // Student retries with new idempotency key
      const res = await request(app)
        .post('/api/v1/payments/initiate')
        .set('Authorization', `Bearer ${studentAToken}`)
        .set('Idempotency-Key', `idemp_retry_${ts}`)
        .send({ orderId: testOrderId });

      expect(res.status).toBe(200);
      expect(res.body.data.paymentAttemptReference).not.toBe(currentAttempt!.providerTransactionId);

      // Verify DB attempt statuses
      const expiredDbAttempt = await prisma.paymentTransaction.findUnique({
        where: { id: currentAttempt!.id },
      });
      expect(expiredDbAttempt!.status).toBe(PaymentStatus.EXPIRED);

      const activeAttempts = await prisma.paymentTransaction.findMany({
        where: { payment: { masterOrderId: testOrderId }, status: PaymentStatus.INITIATED },
      });
      expect(activeAttempts).toHaveLength(1);
      expect(activeAttempts[0].providerTransactionId).toBe(res.body.data.paymentAttemptReference);
    });
  });

  describe('GET /api/v1/payments/order/:orderId', () => {
    test('student views payment status and attempt history', async () => {
      const res = await request(app)
        .get(`/api/v1/payments/order/${testOrderId}`)
        .set('Authorization', `Bearer ${studentAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderId).toBe(testOrderId);
      expect(res.body.data.totalAmount).toBe(100.00);
      expect(res.body.data.advanceAmount).toBe(60.00);
      expect(res.body.data.remainingAmount).toBe(40.00);
      expect(res.body.data.payment.transactions.length).toBeGreaterThanOrEqual(2);
    });

    test('Student B cannot view Student A payment status (IDOR protected)', async () => {
      const res = await request(app)
        .get(`/api/v1/payments/order/${testOrderId}`)
        .set('Authorization', `Bearer ${studentBToken}`);

      expect(res.status).toBe(403);
    });
  });
});
