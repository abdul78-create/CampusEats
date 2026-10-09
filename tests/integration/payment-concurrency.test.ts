import request from 'supertest';
import crypto from 'node:crypto';
import { createApp } from '../../src/app.js';
import { PrismaService } from '../../src/shared/infrastructure/PrismaService.js';
import { TokenService } from '../../src/modules/identity/domain/TokenService.js';
import { MockPaymentProvider } from '../../src/modules/payment/domain/PaymentProvider.js';
import { UserRole, StudentAccountStatus } from '../../src/modules/identity/domain/IdentityEnums.js';
import { VerificationStatus } from '@prisma/client';
import { StallStatus, OrderProcessingMode } from '../../src/modules/stall/domain/StallEnums.js';
import { MasterOrderStatus, SubOrderStatus, PaymentStatus, TransactionType, RefundStatus } from '@prisma/client';

describe('Phase 5 — Payment & Refund Concurrency Integrity', () => {
  const app = createApp();
  const prisma = PrismaService.getClient();
  const provider = new MockPaymentProvider();

  const ts = Date.now().toString(36);
  const studentId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const ownerId = crypto.randomUUID();
  const stallId = crypto.randomUUID();

  let studentToken: string;
  let adminToken: string;

  beforeAll(async () => {
    // 1. Seed users
    await prisma.user.createMany({
      data: [
        {
          id: studentId,
          email: `student_conc_${ts}@campus.edu`,
          phoneNumber: `+9197${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHash',
          role: UserRole.STUDENT,
        },
        {
          id: adminId,
          email: `admin_conc_${ts}@campus.edu`,
          phoneNumber: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHash',
          role: UserRole.ADMIN,
        },
        {
          id: ownerId,
          email: `owner_conc_${ts}@campus.edu`,
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
        fullName: 'Concurrency Student',
        universityRegNumber: `REG-CONC-${ts}`,
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

    studentToken = TokenService.generateTokens({
      userId: studentId,
      role: UserRole.STUDENT,
      email: `student_conc_${ts}@campus.edu`,
    }).accessToken;

    adminToken = TokenService.generateTokens({
      userId: adminId,
      role: UserRole.ADMIN,
      email: `admin_conc_${ts}@campus.edu`,
    }).accessToken;

    await prisma.stall.create({
      data: {
        id: stallId,
        ownerId,
        name: `Conc Stall ${ts}`,
        campusBlock: 'Block Conc',
        liveStatus: StallStatus.OPEN,
        processingMode: OrderProcessingMode.AUTOMATIC,
        isApproved: true,
      },
    });
  });

  describe('Webhook Race Condition (Double Settlement Defense)', () => {
    it('handles 2 concurrent webhook deliveries for the same payment transaction without duplicate crediting', async () => {
      const orderId = crypto.randomUUID();
      const subOrderId = crypto.randomUUID();
      const paymentId = crypto.randomUUID();
      const txnId = crypto.randomUUID();
      const providerTxnId = `TXN_CONC_WH_${ts}`;

      // Create Order in SUBMITTED
      await prisma.masterOrder.create({
        data: {
          id: orderId,
          studentId,
          orderNumber: `ORD-CONC-WH-${ts}`,
          status: MasterOrderStatus.SUBMITTED,
          totalAmount: 100.00,
          advancePercentage: 60,
          advanceAmount: 60.00,
          remainingAmount: 40.00,
          amountPaid: 0.00,
        },
      });

      await prisma.subOrder.create({
        data: {
          id: subOrderId,
          masterOrderId: orderId,
          stallId,
          subOrderNumber: `SUB-CONC-WH-${ts}`,
          status: SubOrderStatus.SUBMITTED,
          subtotalAmount: 100.00,
          advancePaidAmount: 0.00,
          balanceDueAmount: 100.00,
          isBalancePaid: false,
        },
      });

      await prisma.orderItem.create({
        data: {
          id: crypto.randomUUID(),
          subOrderId,
          snapshotItemName: 'Conc Roll',
          snapshotPrice: 100.00,
          snapshotPrepMinutes: 10,
          quantity: 1,
          totalPrice: 100.00,
        },
      });

      // Payment record
      await prisma.payment.create({
        data: {
          id: paymentId,
          masterOrderId: orderId,
          idempotencyKey: `idemp_conc_wh_${ts}`,
          provider: 'mock',
          advancePercentage: 60,
          totalAmount: 100.00,
          advanceAmount: 60.00,
          amountPaid: 0.00,
          amountRemaining: 100.00,
          status: PaymentStatus.PENDING,
        },
      });

      await prisma.paymentTransaction.create({
        data: {
          id: txnId,
          paymentId,
          amount: 60.00,
          transactionType: TransactionType.ADVANCE,
          status: PaymentStatus.INITIATED,
          providerTransactionId: providerTxnId,
        },
      });

      const payload = {
        event: 'payment.success',
        providerTransactionId: providerTxnId,
        amountPaise: 6000,
        currency: 'INR',
        purpose: 'ADVANCE',
        timestamp: Date.now(),
      };

      const rawBody = JSON.stringify(payload);
      const nowSec = Math.floor(Date.now() / 1000);
      const signature = provider.generateTestWebhookSignature(rawBody, nowSec);

      // Fire 2 concurrent webhook deliveries
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/webhooks/payments')
          .set('Content-Type', 'application/json')
          .set('x-webhook-signature', signature)
          .set('x-webhook-timestamp', String(nowSec))
          .send(rawBody),
        request(app)
          .post('/api/v1/webhooks/payments')
          .set('Content-Type', 'application/json')
          .set('x-webhook-signature', signature)
          .set('x-webhook-timestamp', String(nowSec))
          .send(rawBody),
      ]);

      // Both must succeed (200 OK)
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // Verify DB state: MasterOrder must be confirmed exactly once
      const updatedOrder = await prisma.masterOrder.findUnique({
        where: { id: orderId },
      });
      expect(updatedOrder?.status).toBe(MasterOrderStatus.PAYMENT_CONFIRMED);
      expect(Number(updatedOrder?.amountPaid)).toBe(60.00);

      // Verify SubOrder advance was credited exactly once (60.00, balanceDue 40.00)
      const updatedSubOrder = await prisma.subOrder.findUnique({
        where: { id: subOrderId },
      });
      expect(Number(updatedSubOrder?.advancePaidAmount)).toBe(60.00);
      expect(Number(updatedSubOrder?.balanceDueAmount)).toBe(40.00);

      // Verify Payment record status is PARTIALLY_PAID
      const updatedPayment = await prisma.payment.findUnique({
        where: { id: paymentId },
      });
      expect(updatedPayment?.status).toBe(PaymentStatus.PARTIALLY_PAID);
      expect(Number(updatedPayment?.amountPaid)).toBe(60.00);
    });
  });

  describe('Refund Race Condition (Double Refund Defense)', () => {
    it('handles 2 concurrent refund executions for the same rejected sub-order without double refunding', async () => {
      const orderId = crypto.randomUUID();
      const subOrderId = crypto.randomUUID();
      const paymentId = crypto.randomUUID();
      const providerTxnId = `TXN_CONC_REF_${ts}`;

      // Create Order with confirmed advance
      await prisma.masterOrder.create({
        data: {
          id: orderId,
          studentId,
          orderNumber: `ORD-CONC-REF-${ts}`,
          status: MasterOrderStatus.PAYMENT_CONFIRMED,
          totalAmount: 150.00,
          advancePercentage: 70,
          advanceAmount: 105.00,
          remainingAmount: 45.00,
          amountPaid: 105.00,
        },
      });

      // SubOrder rejected by stall
      await prisma.subOrder.create({
        data: {
          id: subOrderId,
          masterOrderId: orderId,
          stallId,
          subOrderNumber: `SUB-CONC-REF-${ts}`,
          status: SubOrderStatus.REJECTED,
          subtotalAmount: 150.00,
          advancePaidAmount: 105.00,
          balanceDueAmount: 45.00,
          isBalancePaid: false,
        },
      });

      await prisma.orderItem.create({
        data: {
          id: crypto.randomUUID(),
          subOrderId,
          snapshotItemName: 'Conc Dosa',
          snapshotPrice: 150.00,
          snapshotPrepMinutes: 10,
          quantity: 1,
          totalPrice: 150.00,
        },
      });

      await prisma.payment.create({
        data: {
          id: paymentId,
          masterOrderId: orderId,
          idempotencyKey: `idemp_conc_ref_${ts}`,
          provider: 'mock',
          advancePercentage: 70,
          totalAmount: 150.00,
          advanceAmount: 105.00,
          amountPaid: 105.00,
          amountRemaining: 45.00,
          status: PaymentStatus.PARTIALLY_PAID,
        },
      });

      await prisma.paymentTransaction.create({
        data: {
          paymentId,
          amount: 105.00,
          transactionType: TransactionType.ADVANCE,
          status: PaymentStatus.SUCCESS,
          providerTransactionId: providerTxnId,
        },
      });

      const idempotencyKey = `ref_conc_${ts}`;

      // Fire 2 concurrent refund requests
      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/v1/refunds/suborder/${subOrderId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Idempotency-Key', idempotencyKey)
          .send({ reason: 'Ingredient shortage concurrent test' }),
        request(app)
          .post(`/api/v1/refunds/suborder/${subOrderId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .set('Idempotency-Key', idempotencyKey)
          .send({ reason: 'Ingredient shortage concurrent test' }),
      ]);

      // Both should succeed (200 OK)
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.data.refundAmount).toBe(105.00);
      expect(res2.body.data.refundAmount).toBe(105.00);

      // Verify exactly ONE Refund record exists in the database
      const refundRecords = await prisma.refund.findMany({
        where: { subOrderId },
      });
      expect(refundRecords).toHaveLength(1);
      expect(refundRecords[0].refundStatus).toBe(RefundStatus.REFUNDED);
      expect(Number(refundRecords[0].refundAmount)).toBe(105.00);

      // Verify SubOrder status is REFUNDED
      const updatedSubOrder = await prisma.subOrder.findUnique({
        where: { id: subOrderId },
      });
      expect(updatedSubOrder?.status).toBe(SubOrderStatus.REFUNDED);
    });
  });
});
