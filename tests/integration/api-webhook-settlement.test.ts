import request from 'supertest';
import crypto from 'node:crypto';
import { createApp } from '../../src/app.js';
import { PrismaService } from '../../src/shared/infrastructure/PrismaService.js';
import { MockPaymentProvider } from '../../src/modules/payment/domain/PaymentProvider.js';
import { UserRole, StudentAccountStatus } from '../../src/modules/identity/domain/IdentityEnums.js';
import { VerificationStatus } from '@prisma/client';
import { StallStatus, OrderProcessingMode } from '../../src/modules/stall/domain/StallEnums.js';
import { MasterOrderStatus, SubOrderStatus, PaymentStatus, TransactionType, NotificationType, AuditActionType } from '@prisma/client';

describe('Phase 5 — Webhook Settlement & Cryptographic Verification API', () => {
  const app = createApp();
  const prisma = PrismaService.getClient();
  const provider = new MockPaymentProvider();

  const ts = Date.now().toString(36);
  const studentId = crypto.randomUUID();
  const ownerId = crypto.randomUUID();
  const stallId = crypto.randomUUID();

  let masterOrderId: string;
  let subOrderId: string;
  let paymentId: string;
  let attemptTransactionId: string;

  beforeAll(async () => {
    // 1. User & Profile
    await prisma.user.createMany({
      data: [
        {
          id: studentId,
          email: `student_wh_${ts}@campus.edu`,
          phoneNumber: `+9195${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHash',
          role: UserRole.STUDENT,
        },
        {
          id: ownerId,
          email: `owner_wh_${ts}@campus.edu`,
          phoneNumber: `+9196${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHash',
          role: UserRole.STALL_OWNER,
        },
      ],
    });

    const profile = await prisma.studentProfile.create({
      data: {
        id: crypto.randomUUID(),
        userId: studentId,
        fullName: 'Webhook Student',
        universityRegNumber: `REG-WH-${ts}`,
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
        name: `Webhook Stall ${ts}`,
        campusBlock: 'Block East',
        liveStatus: StallStatus.OPEN,
        processingMode: OrderProcessingMode.AUTOMATIC,
        isApproved: true,
      },
    });

    // 3. MasterOrder & SubOrder
    const masterOrder = await prisma.masterOrder.create({
      data: {
        id: crypto.randomUUID(),
        studentId,
        orderNumber: `ORD-WH-${ts}`,
        status: MasterOrderStatus.PENDING_PAYMENT,
        totalAmount: 200.00,
        advancePercentage: 50,
        advanceAmount: 100.00,
        remainingAmount: 100.00,
        amountPaid: 0.00,
      },
    });
    masterOrderId = masterOrder.id;

    const subOrder = await prisma.subOrder.create({
      data: {
        id: crypto.randomUUID(),
        masterOrderId,
        stallId,
        subOrderNumber: `SUB-WH-${ts}-S1`,
        status: SubOrderStatus.PENDING_PAYMENT,
        subtotalAmount: 200.00,
        advancePaidAmount: 100.00,
        balanceDueAmount: 100.00,
        isBalancePaid: false,
      },
    });
    subOrderId = subOrder.id;

    // 4. Payment & PaymentTransaction Attempt
    const payment = await prisma.payment.create({
      data: {
        masterOrderId,
        idempotencyKey: `idemp_wh_setup_${ts}`,
        provider: 'mock',
        advancePercentage: 50,
        totalAmount: 200.00,
        advanceAmount: 100.00,
        amountPaid: 0.00,
        amountRemaining: 100.00,
        status: PaymentStatus.INITIATED,
      },
    });
    paymentId = payment.id;

    attemptTransactionId = `ATT_WH_${Date.now()}`;
    await prisma.paymentTransaction.create({
      data: {
        paymentId,
        transactionType: TransactionType.ADVANCE,
        amount: 100.00,
        providerTransactionId: attemptTransactionId,
        status: PaymentStatus.INITIATED,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
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

  describe('POST /api/v1/webhooks/payments', () => {
    test('strictly rejects webhook with missing signature or timestamp (401)', async () => {
      const payload = { eventId: 'evt_1', providerTransactionId: attemptTransactionId };
      const res = await request(app)
        .post('/api/v1/webhooks/payments')
        .send(payload);

      expect(res.status).toBe(401);
    });

    test('strictly rejects expired webhook timestamp (|t - now| > 300s) (401)', async () => {
      const payload = {
        eventId: 'evt_expired',
        providerTransactionId: attemptTransactionId,
        amountPaise: 10000,
        currency: 'INR',
        purpose: 'ADVANCE',
      };
      const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
      const expiredTimestamp = (Math.floor(Date.now() / 1000) - 350).toString();
      const signature = provider.generateTestWebhookSignature(rawBody, expiredTimestamp);

      const res = await request(app)
        .post('/api/v1/webhooks/payments')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', expiredTimestamp)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(401);
    });

    test('strictly rejects tampered payload where signature does not match body (401)', async () => {
      const genuinePayload = { amountPaise: 10000 };
      const genuineRaw = Buffer.from(JSON.stringify(genuinePayload), 'utf8');
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = provider.generateTestWebhookSignature(genuineRaw, timestamp);

      // Send tampered payload with genuine signature
      const tamperedPayload = { amountPaise: 100 };
      const res = await request(app)
        .post('/api/v1/webhooks/payments')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('Content-Type', 'application/json')
        .send(tamperedPayload);

      expect(res.status).toBe(401);
    });

    test('strictly rejects amount mismatch (PAYMENT_AMOUNT_MISMATCH) and marks attempt FAILED (400)', async () => {
      // Create a separate attempt to test amount mismatch
      const mismatchAttemptId = `ATT_MISMATCH_${Date.now()}`;
      await prisma.paymentTransaction.create({
        data: {
          paymentId,
          transactionType: TransactionType.ADVANCE,
          amount: 100.00, // Expected: 10000 paise
          providerTransactionId: mismatchAttemptId,
          status: PaymentStatus.INITIATED,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });

      // Webhook arrives declaring only 5000 paise (₹50.00)
      const mismatchPayload = {
        eventId: 'evt_mismatch',
        eventType: 'payment.success',
        providerTransactionId: mismatchAttemptId,
        orderId: masterOrderId,
        amountPaise: 5000,
        currency: 'INR',
        purpose: 'ADVANCE',
      };
      const rawBody = Buffer.from(JSON.stringify(mismatchPayload), 'utf8');
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = provider.generateTestWebhookSignature(rawBody, timestamp);

      const res = await request(app)
        .post('/api/v1/webhooks/payments')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('Content-Type', 'application/json')
        .send(mismatchPayload);

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('PAYMENT_AMOUNT_MISMATCH');

      // Assert attempt is marked FAILED in PostgreSQL
      const dbAttempt = await prisma.paymentTransaction.findUnique({
        where: { providerTransactionId: mismatchAttemptId },
      });
      expect(dbAttempt!.status).toBe(PaymentStatus.FAILED);
    });

    test('valid HMAC webhook settles payment: transitions PaymentTransaction, Payment, MasterOrder & SubOrders', async () => {
      const payload = {
        eventId: `evt_success_${ts}`,
        eventType: 'payment.success',
        providerTransactionId: attemptTransactionId,
        orderId: masterOrderId,
        amountPaise: 10000, // ₹100.00 exactly matches attempt amount
        currency: 'INR',
        purpose: 'ADVANCE',
      };
      const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = provider.generateTestWebhookSignature(rawBody, timestamp);

      const res = await request(app)
        .post('/api/v1/webhooks/payments')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify DB state updates
      const updatedTxn = await prisma.paymentTransaction.findUnique({
        where: { providerTransactionId: attemptTransactionId },
      });
      expect(updatedTxn!.status).toBe(PaymentStatus.SUCCESS);

      const updatedPayment = await prisma.payment.findUnique({ where: { id: paymentId } });
      expect(updatedPayment!.status).toBe(PaymentStatus.PARTIALLY_PAID); // 100 paid of 200 total
      expect(Number(updatedPayment!.amountPaid)).toBe(100.00);

      const updatedOrder = await prisma.masterOrder.findUnique({ where: { id: masterOrderId } });
      expect(updatedOrder!.status).toBe(MasterOrderStatus.PAYMENT_CONFIRMED);
      expect(Number(updatedOrder!.amountPaid)).toBe(100.00);

      const updatedSubOrder = await prisma.subOrder.findUnique({ where: { id: subOrderId } });
      expect(updatedSubOrder!.status).toBe(SubOrderStatus.PAYMENT_CONFIRMED);

      // Verify persistent notification
      const notification = await prisma.notification.findFirst({
        where: { userId: studentId, type: NotificationType.PAYMENT_CONFIRMATION },
      });
      expect(notification).toBeDefined();
      expect(notification!.title).toBe('Payment Confirmed');

      // Verify audit log
      const auditLog = await prisma.auditLog.findFirst({
        where: { actionType: AuditActionType.PAYMENT_COMPLETED, targetId: paymentId },
      });
      expect(auditLog).toBeDefined();
      // Ensure no sensitive PII/secrets logged
      const auditJson = JSON.stringify(auditLog!.newValue);
      expect(auditJson).not.toContain('vpa');
      expect(auditJson).not.toContain('secret');
    });

    test('webhook idempotency: re-sending identical webhook returns cached 200 without double crediting', async () => {
      const payload = {
        eventId: `evt_success_${ts}`,
        eventType: 'payment.success',
        providerTransactionId: attemptTransactionId,
        orderId: masterOrderId,
        amountPaise: 10000,
        currency: 'INR',
        purpose: 'ADVANCE',
      };
      const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = provider.generateTestWebhookSignature(rawBody, timestamp);

      const res = await request(app)
        .post('/api/v1/webhooks/payments')
        .set('x-webhook-signature', signature)
        .set('x-webhook-timestamp', timestamp)
        .set('Content-Type', 'application/json')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('idempotent');

      // Verify payment amountPaid did NOT double credit
      const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
      expect(Number(payment!.amountPaid)).toBe(100.00); // Still 100, not 200
    });
  });
});
