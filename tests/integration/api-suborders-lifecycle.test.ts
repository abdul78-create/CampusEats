import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../../src/app.js';
import { PrismaService } from '../../src/shared/infrastructure/PrismaService.js';
import { TokenService } from '../../src/modules/identity/domain/TokenService.js';
import { UserRole } from '../../src/modules/identity/domain/IdentityEnums.js';
import { StallStatus, OrderProcessingMode } from '../../src/modules/stall/domain/StallEnums.js';
import { MasterOrderStatus, SubOrderStatus } from '../../src/modules/ordering/domain/OrderEnums.js';

describe('SubOrder Lifecycle: Pickup Collection, Counter Settlement & Admin Refunds', () => {
  const app = createApp();
  const prisma = PrismaService.getClient();

  const timestamp = Date.now().toString(36);

  const ownerId = crypto.randomUUID();
  const studentId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const otherOwnerId = crypto.randomUUID();

  const stallId = crypto.randomUUID();
  const masterOrderId = crypto.randomUUID();

  const subOrderReadyUnpaidId = crypto.randomUUID();
  const subOrderReadyPaidId = crypto.randomUUID();
  const subOrderToRejectId = crypto.randomUUID();

  let ownerToken: string;
  let adminToken: string;
  let otherOwnerToken: string;

  beforeAll(async () => {
    // 1. Users
    await prisma.user.createMany({
      data: [
        {
          id: ownerId,
          email: `owner_${timestamp}@campus.edu`,
          phoneNumber: `+9161${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHashForLifecycleTests',
          role: UserRole.STALL_OWNER,
        },
        {
          id: studentId,
          email: `student_${timestamp}@campus.edu`,
          phoneNumber: `+9162${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHashForLifecycleTests',
          role: UserRole.STUDENT,
        },
        {
          id: adminId,
          email: `admin_${timestamp}@campus.edu`,
          phoneNumber: `+9163${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHashForLifecycleTests',
          role: UserRole.ADMIN,
        },
        {
          id: otherOwnerId,
          email: `other_owner_${timestamp}@campus.edu`,
          phoneNumber: `+9164${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHashForLifecycleTests',
          role: UserRole.STALL_OWNER,
        },
      ],
    });

    // 2. Stall
    await prisma.stall.create({
      data: {
        id: stallId,
        ownerId,
        name: `Lifecycle Stall ${timestamp}`,
        campusBlock: 'Block Central',
        liveStatus: StallStatus.OPEN,
        processingMode: OrderProcessingMode.AUTOMATIC,
        isApproved: true,
      },
    });

    // 3. MasterOrder with multiple suborders in different states
    await prisma.masterOrder.create({
      data: {
        id: masterOrderId,
        orderNumber: `ORD-LC-${timestamp}`,
        studentId,
        advancePercentage: 50,
        totalAmount: 300.00,
        advanceAmount: 150.00,
        remainingAmount: 150.00,
        status: MasterOrderStatus.PAYMENT_CONFIRMED,
        subOrders: {
          create: [
            {
              id: subOrderReadyUnpaidId,
              subOrderNumber: `SUB-UNPAID-${timestamp}`,
              stallId,
              subtotalAmount: 100.00,
              advancePaidAmount: 50.00,
              balanceDueAmount: 50.00,
              isBalancePaid: false,
              status: SubOrderStatus.READY,
              items: {
                create: [
                  {
                    id: crypto.randomUUID(),
                    snapshotItemName: 'Samosa',
                    snapshotPrice: 50.00,
                    snapshotPrepMinutes: 5,
                    quantity: 2,
                    totalPrice: 100.00,
                  },
                ],
              },
            },
            {
              id: subOrderReadyPaidId,
              subOrderNumber: `SUB-PAID-${timestamp}`,
              stallId,
              subtotalAmount: 100.00,
              advancePaidAmount: 50.00,
              balanceDueAmount: 0.00,
              isBalancePaid: true,
              status: SubOrderStatus.READY,
              items: {
                create: [
                  {
                    id: crypto.randomUUID(),
                    snapshotItemName: 'Dosa',
                    snapshotPrice: 100.00,
                    snapshotPrepMinutes: 10,
                    quantity: 1,
                    totalPrice: 100.00,
                  },
                ],
              },
            },
            {
              id: subOrderToRejectId,
              subOrderNumber: `SUB-REJ-${timestamp}`,
              stallId,
              subtotalAmount: 100.00,
              advancePaidAmount: 50.00,
              balanceDueAmount: 50.00,
              isBalancePaid: false,
              status: SubOrderStatus.PAYMENT_CONFIRMED,
              items: {
                create: [
                  {
                    id: crypto.randomUUID(),
                    snapshotItemName: 'Roll',
                    snapshotPrice: 50.00,
                    snapshotPrepMinutes: 8,
                    quantity: 2,
                    totalPrice: 100.00,
                  },
                ],
              },
            },
          ],
        },
      },
    });

    // Tokens
    ownerToken = TokenService.generateTokens({ userId: ownerId, role: UserRole.STALL_OWNER, email: 'owner@campus.edu' }).accessToken;
    adminToken = TokenService.generateTokens({ userId: adminId, role: UserRole.ADMIN, email: 'admin@campus.edu' }).accessToken;
    otherOwnerToken = TokenService.generateTokens({ userId: otherOwnerId, role: UserRole.STALL_OWNER, email: 'other@campus.edu' }).accessToken;
  });

  afterAll(async () => {
    await prisma.refund.deleteMany({
      where: { subOrderId: { in: [subOrderReadyUnpaidId, subOrderReadyPaidId, subOrderToRejectId] } },
    });
    await prisma.masterOrder.deleteMany({ where: { id: masterOrderId } });
    await prisma.stall.deleteMany({ where: { id: stallId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, studentId, adminId, otherOwnerId] } } });
  });

  // ==========================================
  // COLLECTION TESTS
  // ==========================================

  it('COLLECTION BARRIER: rejects pickup collection when remaining balance is unpaid', async () => {
    const res = await request(app)
      .post(`/api/v1/sub-orders/${subOrderReadyUnpaidId}/collect`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.message).toContain('Remaining balance must be settled before order collection');
  });

  it('COUNTER SETTLEMENT: stall owner records counter cash settlement for unpaid sub-order', async () => {
    const res = await request(app)
      .post(`/api/v1/sub-orders/${subOrderReadyUnpaidId}/counter-settlement`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        paymentMethod: 'CASH',
        notes: 'Cash received at counter',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isBalancePaid).toBe(true);
    expect(res.body.data.settledAmount).toBe(50.00);
  });

  it('COLLECTION SUCCESS: stall owner collects sub-order after balance is settled', async () => {
    const res = await request(app)
      .post(`/api/v1/sub-orders/${subOrderReadyPaidId}/collect`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('COLLECTED');
  });

  // ==========================================
  // REJECTION & REFUND TESTS
  // ==========================================

  it('OPERATIONAL REJECTION: stall owner rejects sub-order due to kitchen surge', async () => {
    const res = await request(app)
      .post(`/api/v1/sub-orders/${subOrderToRejectId}/reject`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ reason: 'Kitchen capacity exceeded' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('REJECTED');
    expect(res.body.data.refundEligible).toBe(true);
  });

  it('UNAUTHORIZED REFUND: stall owner cannot execute administrative refunds', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/refunds/${subOrderToRejectId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ reason: 'Attempted self-refund' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('ADMIN REFUND SUCCESS: admin processes isolated refund for rejected sub-order', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/refunds/${subOrderToRejectId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Item out of stock during kitchen surge' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('PROCESSED');
    expect(res.body.data.refundAmount).toBe(50.00);
  });

  it('DUPLICATE REFUND PROTECTION: rejects refund when already processed', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/refunds/${subOrderToRejectId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Duplicate refund attempt' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
