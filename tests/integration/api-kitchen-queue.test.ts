import request from 'supertest';
import crypto from 'node:crypto';
import { createApp } from '../../src/app.js';
import { PrismaService } from '../../src/shared/infrastructure/PrismaService.js';
import { TokenService } from '../../src/modules/identity/domain/TokenService.js';
import { UserRole } from '../../src/modules/identity/domain/IdentityEnums.js';
import { StallStatus, OrderProcessingMode } from '../../src/modules/stall/domain/StallEnums.js';
import { MasterOrderStatus, SubOrderStatus } from '@prisma/client';
import { KitchenQueueState } from '../../src/modules/realtime/domain/RealtimeEnums.js';

describe('Phase 6 — Kitchen Queue Operational API (GET /stalls/:stallId/kitchen/queue)', () => {
  const app = createApp();
  const prisma = PrismaService.getClient();

  const ts = Date.now().toString(36);
  const studentId = crypto.randomUUID();
  const ownerId = crypto.randomUUID();
  const stallId = crypto.randomUUID();
  const foreignStallId = crypto.randomUUID();
  const staffUserId = crypto.randomUUID();

  let studentToken: string;
  let ownerToken: string;
  let staffToken: string;
  let masterOrderId: string;
  let subOrder1Id: string;
  let subOrder2Id: string;
  let subOrder3Id: string;

  beforeAll(async () => {
    // 1. Users
    await prisma.user.createMany({
      data: [
        {
          id: studentId,
          email: `student_kq_${ts}@campus.edu`,
          phoneNumber: `+9194${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHash',
          role: UserRole.STUDENT,
        },
        {
          id: ownerId,
          email: `owner_kq_${ts}@campus.edu`,
          phoneNumber: `+9194${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHash',
          role: UserRole.STALL_OWNER,
        },
        {
          id: staffUserId,
          email: `staff_kq_${ts}@campus.edu`,
          phoneNumber: `+9194${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHash',
          role: UserRole.STALL_STAFF,
        },
      ],
    });

    await prisma.studentProfile.create({
      data: {
        userId: studentId,
        fullName: 'Jane Student',
        universityRegNumber: `KQ-REG-${ts}`,
        accountStatus: 'ACTIVE',
      },
    });

    // 2. Stalls
    await prisma.stall.create({
      data: {
        id: stallId,
        ownerId,
        name: `Kitchen Test Stall ${ts}`,
        campusBlock: 'Block C',
        liveStatus: StallStatus.OPEN,
        processingMode: OrderProcessingMode.AUTOMATIC,
        isApproved: true,
        capacity: {
          create: {
            maxActiveOrders: 10,
            pickupGracePeriodMinutes: 15,
          },
        },
      },
    });

    await prisma.stall.create({
      data: {
        id: foreignStallId,
        ownerId,
        name: `Foreign Stall ${ts}`,
        campusBlock: 'Block D',
        liveStatus: StallStatus.OPEN,
        processingMode: OrderProcessingMode.AUTOMATIC,
        isApproved: true,
        capacity: {
          create: {
            maxActiveOrders: 10,
            pickupGracePeriodMinutes: 15,
          },
        },
      },
    });

    // 3. Staff assignment
    await prisma.staffAccount.create({
      data: {
        userId: staffUserId,
        stallId,
        permissions: {
          create: [{ permission: 'MANAGE_ORDERS' }],
        },
      },
    });

    // 4. Tokens
    studentToken = TokenService.generateTokens({
      userId: studentId,
      role: UserRole.STUDENT,
      email: `student_kq_${ts}@campus.edu`,
    }).accessToken;

    ownerToken = TokenService.generateTokens({
      userId: ownerId,
      role: UserRole.STALL_OWNER,
      email: `owner_kq_${ts}@campus.edu`,
    }).accessToken;

    staffToken = TokenService.generateTokens({
      userId: staffUserId,
      role: UserRole.STALL_STAFF,
      email: `staff_kq_${ts}@campus.edu`,
    }).accessToken;

    // 5. Orders & SubOrders in various states
    masterOrderId = crypto.randomUUID();
    await prisma.masterOrder.create({
      data: {
        id: masterOrderId,
        studentId,
        orderNumber: `ORD-KQ-${ts}`,
        status: MasterOrderStatus.PAYMENT_CONFIRMED,
        totalAmount: 300,
        advancePercentage: 50,
        advanceAmount: 150,
        remainingAmount: 150,
        amountPaid: 150,
      },
    });

    // SubOrder 1: PAYMENT_CONFIRMED (QUEUED)
    subOrder1Id = crypto.randomUUID();
    const pickupTime1 = new Date(Date.now() + 25 * 60 * 1000);
    await prisma.subOrder.create({
      data: {
        id: subOrder1Id,
        masterOrderId,
        stallId,
        subOrderNumber: `SO-KQ-1-${ts}`,
        status: SubOrderStatus.PAYMENT_CONFIRMED,
        subtotalAmount: 100,
        advancePaidAmount: 50,
        balanceDueAmount: 50,
        items: {
          create: [
            {
              snapshotItemName: 'Samosa Chat',
              snapshotPrice: 100,
              snapshotPrepMinutes: 10,
              quantity: 1,
              totalPrice: 100,
            },
          ],
        },
        pickupSchedule: {
          create: {
            requestedPickupTime: pickupTime1,
            scheduledPickupTime: pickupTime1,
            earliestFeasiblePickupTime: pickupTime1,
            preparationTimeMinutes: 10,
            queueDelayMinutes: 0,
            operationalBufferMinutes: 2,
          },
        },
      },
    });

    // SubOrder 2: PREPARING (IN_PREPARATION)
    subOrder2Id = crypto.randomUUID();
    const pickupTime2 = new Date(Date.now() + 15 * 60 * 1000); // earlier pickup time
    await prisma.subOrder.create({
      data: {
        id: subOrder2Id,
        masterOrderId,
        stallId,
        subOrderNumber: `SO-KQ-2-${ts}`,
        status: SubOrderStatus.PREPARING,
        subtotalAmount: 100,
        advancePaidAmount: 50,
        balanceDueAmount: 50,
        items: {
          create: [
            {
              snapshotItemName: 'Masala Dosa',
              snapshotPrice: 100,
              snapshotPrepMinutes: 8,
              quantity: 1,
              totalPrice: 100,
            },
          ],
        },
        pickupSchedule: {
          create: {
            requestedPickupTime: pickupTime2,
            scheduledPickupTime: pickupTime2,
            earliestFeasiblePickupTime: pickupTime2,
            preparationTimeMinutes: 8,
            queueDelayMinutes: 0,
            operationalBufferMinutes: 2,
          },
        },
      },
    });

    // SubOrder 3: READY (READY_FOR_PICKUP)
    subOrder3Id = crypto.randomUUID();
    const pickupTime3 = new Date(Date.now() + 35 * 60 * 1000);
    const readyAt = new Date();
    const graceExpiry = new Date(readyAt.getTime() + 15 * 60 * 1000);
    await prisma.subOrder.create({
      data: {
        id: subOrder3Id,
        masterOrderId,
        stallId,
        subOrderNumber: `SO-KQ-3-${ts}`,
        status: SubOrderStatus.READY,
        subtotalAmount: 100,
        advancePaidAmount: 50,
        balanceDueAmount: 50,
        pickupGraceExpiresAt: graceExpiry,
        items: {
          create: [
            {
              snapshotItemName: 'Cold Coffee',
              snapshotPrice: 100,
              snapshotPrepMinutes: 5,
              quantity: 1,
              totalPrice: 100,
            },
          ],
        },
        pickupSchedule: {
          create: {
            requestedPickupTime: pickupTime3,
            scheduledPickupTime: pickupTime3,
            earliestFeasiblePickupTime: pickupTime3,
            preparationTimeMinutes: 5,
            queueDelayMinutes: 0,
            operationalBufferMinutes: 2,
          },
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { subOrder: { stallId: { in: [stallId, foreignStallId] } } } });
    await prisma.pickupSchedule.deleteMany({ where: { subOrder: { stallId: { in: [stallId, foreignStallId] } } } });
    await prisma.subOrder.deleteMany({ where: { stallId: { in: [stallId, foreignStallId] } } });
    await prisma.masterOrder.deleteMany({ where: { id: masterOrderId } });
    await prisma.staffPermission.deleteMany({ where: { staffAccount: { stallId } } });
    await prisma.staffAccount.deleteMany({ where: { stallId } });
    await prisma.stallCapacity.deleteMany({ where: { stallId: { in: [stallId, foreignStallId] } } });
    await prisma.stall.deleteMany({ where: { id: { in: [stallId, foreignStallId] } } });
    await prisma.studentProfile.deleteMany({ where: { userId: studentId } });
    await prisma.user.deleteMany({ where: { id: { in: [studentId, ownerId, staffUserId] } } });
    await prisma.$disconnect();
  });

  it('rejects unauthenticated request with 401', async () => {
    const res = await request(app).get(`/api/v1/stalls/${stallId}/kitchen/queue`);
    expect(res.status).toBe(401);
  });

  it('strictly forbids students from accessing kitchen queue with 403', async () => {
    const res = await request(app)
      .get(`/api/v1/stalls/${stallId}/kitchen/queue`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });

  it('strictly forbids stall staff of stall A from accessing queue of foreign stall B (403)', async () => {
    const res = await request(app)
      .get(`/api/v1/stalls/${foreignStallId}/kitchen/queue`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(403);
  });

  it('allows stall owner to retrieve kitchen queue with derived operational states', async () => {
    const res = await request(app)
      .get(`/api/v1/stalls/${stallId}/kitchen/queue`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.stallId).toBe(stallId);
    expect(res.body.data.maxActiveOrders).toBe(10);
    expect(res.body.data.activePreparingCount).toBe(1); // subOrder 2 is PREPARING
    expect(res.body.data.surgeEvaluation.isSurgeActive).toBe(false);
    expect(res.body.data.queueCount).toBe(3);

    const queue = res.body.data.queue;
    expect(queue.length).toBe(3);

    // Verify deterministic sorting: SubOrder 2 (earlier pickup) must be first!
    expect(queue[0].subOrderId).toBe(subOrder2Id);
    expect(queue[0].queueState).toBe(KitchenQueueState.IN_PREPARATION);

    expect(queue[1].subOrderId).toBe(subOrder1Id);
    expect(queue[1].queueState).toBe(KitchenQueueState.QUEUED);

    expect(queue[2].subOrderId).toBe(subOrder3Id);
    expect(queue[2].queueState).toBe(KitchenQueueState.READY_FOR_PICKUP);
    expect(queue[2].graceDetails).not.toBeNull();
    expect(queue[2].graceDetails.graceStart).toBeDefined();
    expect(queue[2].graceDetails.graceExpiry).toBeDefined();
    expect(queue[2].graceDetails.warningAt).toBeDefined();
  });

  it('allows assigned staff to retrieve kitchen queue', async () => {
    const res = await request(app)
      .get(`/api/v1/stalls/${stallId}/kitchen/queue`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.queueCount).toBe(3);
  });
});
