import request from 'supertest';
import crypto from 'node:crypto';
import { createApp } from '../../src/app.js';
import { PrismaService } from '../../src/shared/infrastructure/PrismaService.js';
import { TokenService } from '../../src/modules/identity/domain/TokenService.js';
import { MockPaymentProvider } from '../../src/modules/payment/domain/PaymentProvider.js';
import { UserRole, StudentAccountStatus } from '../../src/modules/identity/domain/IdentityEnums.js';
import { VerificationStatus } from '@prisma/client';
import { StallStatus, OrderProcessingMode } from '../../src/modules/stall/domain/StallEnums.js';
import { MasterOrderStatus, SubOrderStatus, PaymentStatus, TransactionType, RefundStatus, AuditActionType, NotificationType } from '@prisma/client';

describe('Phase 5 — Fault-Isolated Sub-Order Refunds API', () => {
  const app = createApp();
  const prisma = PrismaService.getClient();
  const provider = new MockPaymentProvider();

  const ts = Date.now().toString(36);
  const studentId = crypto.randomUUID();
  const otherStudentId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const ownerAId = crypto.randomUUID();
  const ownerBId = crypto.randomUUID();

  const stallAId = crypto.randomUUID();
  const stallBId = crypto.randomUUID();

  let studentToken: string;
  let otherStudentToken: string;
  let adminToken: string;

  let masterOrderId: string;
  let subOrderAId: string;
  let subOrderBId: string;
  let paymentId: string;

  beforeAll(async () => {
    // 1. Users
    await prisma.user.createMany({
      data: [
        {
          id: studentId,
          email: `student_ref_${ts}@campus.edu`,
          phoneNumber: `+9197${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHash',
          role: UserRole.STUDENT,
        },
        {
          id: otherStudentId,
          email: `other_ref_${ts}@campus.edu`,
          phoneNumber: `+9197${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHash',
          role: UserRole.STUDENT,
        },
        {
          id: adminId,
          email: `admin_ref_${ts}@campus.edu`,
          phoneNumber: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHash',
          role: UserRole.ADMIN,
        },
        {
          id: ownerAId,
          email: `owner_a_${ts}@campus.edu`,
          phoneNumber: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHash',
          role: UserRole.STALL_OWNER,
        },
        {
          id: ownerBId,
          email: `owner_b_${ts}@campus.edu`,
          phoneNumber: `+9198${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHash',
          role: UserRole.STALL_OWNER,
        },
      ],
    });

    const profileA = await prisma.studentProfile.create({
      data: {
        id: crypto.randomUUID(),
        userId: studentId,
        fullName: 'Refund Student A',
        universityRegNumber: `REG-REF-A-${ts}`,
        accountStatus: StudentAccountStatus.ACTIVE,
      },
    });

    await prisma.studentVerification.create({
      data: {
        id: crypto.randomUUID(),
        studentProfileId: profileA.id,
        status: VerificationStatus.ACTIVE,
      },
    });

    const profileB = await prisma.studentProfile.create({
      data: {
        id: crypto.randomUUID(),
        userId: otherStudentId,
        fullName: 'Refund Student B',
        universityRegNumber: `REG-REF-B-${ts}`,
        accountStatus: StudentAccountStatus.ACTIVE,
      },
    });

    await prisma.studentVerification.create({
      data: {
        id: crypto.randomUUID(),
        studentProfileId: profileB.id,
        status: VerificationStatus.ACTIVE,
      },
    });

    // 2. Tokens
    studentToken = TokenService.generateTokens({
      userId: studentId,
      role: UserRole.STUDENT,
      email: `student_ref_${ts}@campus.edu`,
    }).accessToken;

    otherStudentToken = TokenService.generateTokens({
      userId: otherStudentId,
      role: UserRole.STUDENT,
      email: `other_ref_${ts}@campus.edu`,
    }).accessToken;

    adminToken = TokenService.generateTokens({
      userId: adminId,
      role: UserRole.ADMIN,
      email: `admin_ref_${ts}@campus.edu`,
    }).accessToken;

    // 3. Stalls
    await prisma.stall.create({
      data: {
        id: stallAId,
        ownerId: ownerAId,
        name: `Ref Stall A ${ts}`,
        campusBlock: 'Block A',
        liveStatus: StallStatus.OPEN,
        processingMode: OrderProcessingMode.AUTOMATIC,
        isApproved: true,
      },
    });

    await prisma.stall.create({
      data: {
        id: stallBId,
        ownerId: ownerBId,
        name: `Ref Stall B ${ts}`,
        campusBlock: 'Block B',
        liveStatus: StallStatus.OPEN,
        processingMode: OrderProcessingMode.AUTOMATIC,
        isApproved: true,
      },
    });

    // 4. Multi-stall MasterOrder & SubOrders
    masterOrderId = crypto.randomUUID();
    subOrderAId = crypto.randomUUID();
    subOrderBId = crypto.randomUUID();

    await prisma.masterOrder.create({
      data: {
        id: masterOrderId,
        studentId,
        orderNumber: `ORD-REF-${ts}`,
        status: MasterOrderStatus.PAYMENT_CONFIRMED,
        totalAmount: 200.00,
        advancePercentage: 70,
        advanceAmount: 140.00,
        remainingAmount: 60.00,
        amountPaid: 140.00,
      },
    });

    // SubOrder A: subtotal 120, advancePaid 84, balanceDue 36
    await prisma.subOrder.create({
      data: {
        id: subOrderAId,
        masterOrderId,
        stallId: stallAId,
        subOrderNumber: `SUB-REF-${ts}-A`,
        status: SubOrderStatus.CONFIRMED,
        subtotalAmount: 120.00,
        advancePaidAmount: 84.00,
        balanceDueAmount: 36.00,
        isBalancePaid: false,
      },
    });

    await prisma.orderItem.create({
      data: {
        id: crypto.randomUUID(),
        subOrderId: subOrderAId,
        snapshotItemName: 'Pizza Slice',
        snapshotPrice: 120.00,
        snapshotPrepMinutes: 10,
        quantity: 1,
        totalPrice: 120.00,
      },
    });

    // SubOrder B: subtotal 80, advancePaid 56, balanceDue 24
    await prisma.subOrder.create({
      data: {
        id: subOrderBId,
        masterOrderId,
        stallId: stallBId,
        subOrderNumber: `SUB-REF-${ts}-B`,
        status: SubOrderStatus.CONFIRMED,
        subtotalAmount: 80.00,
        advancePaidAmount: 56.00,
        balanceDueAmount: 24.00,
        isBalancePaid: false,
      },
    });

    await prisma.orderItem.create({
      data: {
        id: crypto.randomUUID(),
        subOrderId: subOrderBId,
        snapshotItemName: 'Fruit Juice',
        snapshotPrice: 80.00,
        snapshotPrepMinutes: 5,
        quantity: 1,
        totalPrice: 80.00,
      },
    });

    // Payment Record
    const payment = await prisma.payment.create({
      data: {
        masterOrderId,
        idempotencyKey: `idemp_ref_${ts}`,
        provider: 'mock',
        advancePercentage: 70,
        totalAmount: 200.00,
        advanceAmount: 140.00,
        amountPaid: 140.00,
        amountRemaining: 60.00,
        status: PaymentStatus.PARTIALLY_PAID,
      },
    });
    paymentId = payment.id;

    await prisma.paymentTransaction.create({
      data: {
        paymentId,
        amount: 140.00,
        transactionType: TransactionType.ADVANCE,
        status: PaymentStatus.SUCCESS,
        providerTransactionId: `TXN_ADV_ORIG_${ts}`,
      },
    });
  });

  describe('Fault Isolation and Sub-Order Refund Engine', () => {
    it('blocks refund initiation by non-admin students with 403 Forbidden', async () => {
      const res = await request(app)
        .post(`/api/v1/refunds/suborder/${subOrderAId}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ reason: 'Student trying to self-refund' });

      expect(res.status).toBe(403);
    });

    it('blocks refund on a non-rejected, non-cancelled sub-order with 400 Bad Request', async () => {
      // SubOrder A is currently CONFIRMED
      const res = await request(app)
        .post(`/api/v1/refunds/suborder/${subOrderAId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Premature refund' });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('REJECTED or CANCELLED');
    });

    it('processes isolated refund on rejected SubOrder A, preserving sibling SubOrder B and deriving PARTIALLY_FULFILLED', async () => {
      // 1. Stall A rejects SubOrder A
      await prisma.subOrder.update({
        where: { id: subOrderAId },
        data: {
          status: SubOrderStatus.REJECTED,
        },
      });

      // 2. Admin triggers isolated refund for SubOrder A
      const idempotencyKey = `ref_key_${ts}`;
      const res = await request(app)
        .post(`/api/v1/refunds/suborder/${subOrderAId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({ reason: 'Out of pizza dough' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.subOrderId).toBe(subOrderAId);
      // Authoritative calculation: SubOrder A advance was exactly ₹84.00
      expect(res.body.data.refundAmount).toBe(84.00);
      expect(res.body.data.refundStatus).toBe(RefundStatus.REFUNDED);
      expect(res.body.data.providerRefundId).toBeDefined();

      // 3. Verify SubOrder A is marked REFUNDED in DB
      const dbSubOrderA = await prisma.subOrder.findUnique({
        where: { id: subOrderAId },
      });
      expect(dbSubOrderA?.status).toBe(SubOrderStatus.REFUNDED);

      // 4. Fault Isolation: Verify sibling SubOrder B remains active in CONFIRMED
      const dbSubOrderB = await prisma.subOrder.findUnique({
        where: { id: subOrderBId },
      });
      expect(dbSubOrderB?.status).toBe(SubOrderStatus.CONFIRMED);
      expect(Number(dbSubOrderB?.advancePaidAmount)).toBe(56.00);

      // 5. Verify MasterOrder status derived: since SubOrder A is REFUNDED and SubOrder B is CONFIRMED
      const dbMasterOrder = await prisma.masterOrder.findUnique({
        where: { id: masterOrderId },
      });
      expect(dbMasterOrder?.status).toBe(MasterOrderStatus.PARTIALLY_FULFILLED);

      // 6. Verify Refund entity in DB
      const dbRefund = await prisma.refund.findUnique({
        where: { subOrderId: subOrderAId },
      });
      expect(dbRefund).not.toBeNull();
      expect(dbRefund?.refundStatus).toBe(RefundStatus.REFUNDED);
      expect(Number(dbRefund?.refundAmount)).toBe(84.00);
      expect(dbRefund?.providerRefundId).toBe(res.body.data.providerRefundId);

      // 7. Verify Student Notification created
      const notification = await prisma.notification.findFirst({
        where: {
          userId: studentId,
          type: NotificationType.REFUND_PROCESSED,
        },
      });
      expect(notification).not.toBeNull();
      expect(notification?.message).toContain('₹84.00');

      // 8. Verify Audit Log entry created
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          targetEntity: 'Refund',
          targetId: dbRefund?.id,
          actionType: AuditActionType.REFUND_COMPLETED,
        },
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog?.actorId).toBe(adminId);
    });

    it('guarantees refund idempotency: duplicate refund request returns cached result with 0 double refund', async () => {
      const res = await request(app)
        .post(`/api/v1/refunds/suborder/${subOrderAId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', `ref_key_${ts}`)
        .send({ reason: 'Out of pizza dough' });

      expect(res.status).toBe(200);
      expect(res.body.data.subOrderId).toBe(subOrderAId);
      expect(res.body.data.refundStatus).toBe(RefundStatus.REFUNDED);
      expect(res.body.data.refundAmount).toBe(84.00);

      // Exactly 1 refund record exists in DB for this SubOrder
      const count = await prisma.refund.count({
        where: { subOrderId: subOrderAId },
      });
      expect(count).toBe(1);
    });

    it('enforces IDOR protection on GET /api/v1/refunds/suborder/:id', async () => {
      // 1. Order owner can fetch refund details
      const ownerRes = await request(app)
        .get(`/api/v1/refunds/suborder/${subOrderAId}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(ownerRes.status).toBe(200);
      expect(ownerRes.body.data.refundAmount).toBe(84.00);
      expect(ownerRes.body.data.refundStatus).toBe(RefundStatus.REFUNDED);

      // 2. Another student gets 403 Forbidden
      const foreignRes = await request(app)
        .get(`/api/v1/refunds/suborder/${subOrderAId}`)
        .set('Authorization', `Bearer ${otherStudentToken}`);

      expect(foreignRes.status).toBe(403);
      expect(foreignRes.body.error.message).toContain('Unauthorized');
    });
  });
});
