import request from 'supertest';
import crypto from 'node:crypto';
import { createApp } from '../../src/app.js';
import { PrismaService } from '../../src/shared/infrastructure/PrismaService.js';
import { TokenService } from '../../src/modules/identity/domain/TokenService.js';
import { MockPaymentProvider } from '../../src/modules/payment/domain/PaymentProvider.js';
import { UserRole, StudentAccountStatus } from '../../src/modules/identity/domain/IdentityEnums.js';
import { VerificationStatus } from '@prisma/client';
import { StallStatus, OrderProcessingMode, StaffPermissionType } from '../../src/modules/stall/domain/StallEnums.js';
import { MasterOrderStatus, SubOrderStatus, PaymentStatus, TransactionType } from '@prisma/client';

describe('Phase 5 — Online Balance Payment & Food Collection Gate API', () => {
  const app = createApp();
  const prisma = PrismaService.getClient();
  const provider = new MockPaymentProvider();

  const ts = Date.now().toString(36);
  const studentId = crypto.randomUUID();
  const ownerId = crypto.randomUUID();
  const stallId = crypto.randomUUID();

  let studentToken: string;
  let ownerToken: string;
  let masterOrderId: string;
  let subOrderId: string;
  let paymentId: string;

  beforeAll(async () => {
    // 1. Users
    await prisma.user.createMany({
      data: [
        {
          id: studentId,
          email: `student_bal_${ts}@campus.edu`,
          phoneNumber: `+9197${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHash',
          role: UserRole.STUDENT,
        },
        {
          id: ownerId,
          email: `owner_bal_${ts}@campus.edu`,
          phoneNumber: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHash',
          role: UserRole.STALL_OWNER,
        },
      ],
    });

    const profile = await prisma.studentProfile.create({
      data: {
        id: crypto.randomUUID(),
        userId: studentId,
        fullName: 'Balance Student',
        universityRegNumber: `REG-BAL-${ts}`,
        accountStatus: StudentAccountStatus.ACTIVE,
      },
    });

    await prisma.studentVerification.create({
      data: {
        id: crypto.randomUUID(),
        studentProfileId: profile.id,
        status: VerificationStatus.ACTIVE,
      },
    });

    // 2. Stall
    await prisma.stall.create({
      data: {
        id: stallId,
        ownerId,
        name: `Balance Stall ${ts}`,
        campusBlock: 'Block Center',
        liveStatus: StallStatus.OPEN,
        processingMode: OrderProcessingMode.AUTOMATIC,
        isApproved: true,
      },
    });

    // 3. MasterOrder & SubOrder: advance confirmed (₹60.00), remaining balance ₹40.00
    const masterOrder = await prisma.masterOrder.create({
      data: {
        id: crypto.randomUUID(),
        studentId,
        orderNumber: `ORD-BAL-${ts}`,
        status: MasterOrderStatus.PAYMENT_CONFIRMED,
        totalAmount: 100.00,
        advancePercentage: 60,
        advanceAmount: 60.00,
        remainingAmount: 40.00,
        amountPaid: 60.00,
      },
    });
    masterOrderId = masterOrder.id;

    const subOrder = await prisma.subOrder.create({
      data: {
        id: crypto.randomUUID(),
        masterOrderId,
        stallId,
        subOrderNumber: `SUB-BAL-${ts}-S1`,
        status: SubOrderStatus.PREPARING, // Currently cooking (not yet READY)
        subtotalAmount: 100.00,
        advancePaidAmount: 60.00,
        balanceDueAmount: 40.00,
        isBalancePaid: false,
      },
    });
    subOrderId = subOrder.id;

    await prisma.orderItem.create({
      data: {
        id: crypto.randomUUID(),
        subOrderId,
        snapshotItemName: 'Cold Coffee',
        snapshotPrice: 100.00,
        snapshotPrepMinutes: 5,
        quantity: 1,
        totalPrice: 100.00,
      },
    });

    const payment = await prisma.payment.create({
      data: {
        masterOrderId,
        idempotencyKey: `idemp_bal_${ts}`,
        provider: 'mock',
        advancePercentage: 60,
        totalAmount: 100.00,
        advanceAmount: 60.00,
        amountPaid: 60.00,
        amountRemaining: 40.00,
        status: PaymentStatus.PARTIALLY_PAID,
      },
    });
    paymentId = payment.id;

    studentToken = TokenService.generateTokens({
      userId: studentId,
      role: UserRole.STUDENT,
      email: `student_bal_${ts}@campus.edu`,
    }).accessToken;

    ownerToken = TokenService.generateTokens({
      userId: ownerId,
      role: UserRole.STALL_OWNER,
      email: `owner_bal_${ts}@campus.edu`,
    }).accessToken;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId: studentId } });
    await prisma.paymentTransaction.deleteMany({ where: { paymentId } });
    await prisma.payment.deleteMany({ where: { id: paymentId } });
    await prisma.subOrder.deleteMany({ where: { id: subOrderId } });
    await prisma.masterOrder.deleteMany({ where: { id: masterOrderId } });
    await prisma.stall.deleteMany({ where: { id: stallId } });
    await prisma.studentVerification.deleteMany({
      where: { studentProfile: { userId: studentId } },
    });
    await prisma.studentProfile.deleteMany({ where: { userId: studentId } });
    await prisma.user.deleteMany({ where: { id: { in: [studentId, ownerId] } } });
  });

  describe('Lifecycle Precondition & Collection Gate', () => {
    test('balance settlement is blocked when sub-order is in PREPARING (must reach READY)', async () => {
      const res = await request(app)
        .post('/api/v1/payments/balance/online')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('Idempotency-Key', `idemp_bal_prep_${ts}`)
        .send({ subOrderId });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('READY status');
    });

    test('food collection handover is blocked when balance is unsettled', async () => {
      // Transition sub-order to READY first
      await prisma.subOrder.update({
        where: { id: subOrderId },
        data: { status: SubOrderStatus.READY },
      });

      const res = await request(app)
        .post(`/api/v1/sub-orders/${subOrderId}/collect`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('Remaining balance');
    });

    test('once READY, student successfully initiates online balance payment', async () => {
      const res = await request(app)
        .post('/api/v1/payments/balance/online')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('Idempotency-Key', `idemp_bal_ready_${ts}`)
        .send({ subOrderId });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.intentPayload).toContain('am=40.00'); // Exact remaining balance
      expect(res.body.data.intentPayload).toContain('cu=INR');

      // Verify transaction attempt created in DB
      const attempt = await prisma.paymentTransaction.findFirst({
        where: {
          paymentId,
          transactionType: TransactionType.REMAINING_BALANCE,
          status: PaymentStatus.INITIATED,
        },
      });
      expect(attempt).toBeDefined();
      expect(Number(attempt!.amount)).toBe(40.00);

      // Webhook settles remaining balance
      const attemptId = attempt!.providerTransactionId!;
      const webhookPayload = {
        eventId: `evt_bal_${ts}`,
        eventType: 'payment.success',
        providerTransactionId: attemptId,
        orderId: masterOrderId,
        amountPaise: 4000, // ₹40.00
        currency: 'INR',
        purpose: 'REMAINING_BALANCE',
        metadata: { subOrderId },
      };
      const rawBody = Buffer.from(JSON.stringify(webhookPayload), 'utf8');
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = provider.generateTestWebhookSignature(rawBody, timestamp);

      const whRes = await request(app)
        .post('/api/v1/webhooks/payments')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('Content-Type', 'application/json')
        .send(webhookPayload);

      expect(whRes.status).toBe(200);

      // Verify sub-order balance is marked paid
      const updatedSub = await prisma.subOrder.findUnique({ where: { id: subOrderId } });
      expect(updatedSub!.isBalancePaid).toBe(true);
      expect(Number(updatedSub!.balanceDueAmount)).toBe(0.00);
    });

    test('food collection handover succeeds after balance is paid', async () => {
      const res = await request(app)
        .post(`/api/v1/sub-orders/${subOrderId}/collect`)
        .set('Authorization', `Bearer ${ownerToken}`);

      if (res.status !== 200) {
        console.log('COLLECT ERROR:', res.status, res.body);
      }
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(SubOrderStatus.COLLECTED);

      const dbSub = await prisma.subOrder.findUnique({ where: { id: subOrderId } });
      expect(dbSub!.status).toBe(SubOrderStatus.COLLECTED);
    });
  });
});
