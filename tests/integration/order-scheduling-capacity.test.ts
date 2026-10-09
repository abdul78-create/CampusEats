import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../../src/app.js';
import { PrismaService } from '../../src/shared/infrastructure/PrismaService.js';
import { TokenService } from '../../src/modules/identity/domain/TokenService.js';
import { UserRole, StudentAccountStatus } from '../../src/modules/identity/domain/IdentityEnums.js';
import { StallStatus, OrderProcessingMode, ItemAvailabilityState } from '../../src/modules/stall/domain/StallEnums.js';
import { SubOrderStatus, MasterOrderStatus } from '../../src/modules/ordering/domain/OrderEnums.js';

describe('Order Scheduling, Capacity & Concurrency API Tests (Phase 3)', () => {
  const app = createApp();
  const prisma = PrismaService.getClient();

  const timestamp = Date.now().toString(36);

  const studentAId = crypto.randomUUID();
  const studentBId = crypto.randomUUID();
  const ownerAId = crypto.randomUUID();
  const ownerBId = crypto.randomUUID();

  const stallAId = crypto.randomUUID();
  const stallBId = crypto.randomUUID();

  const itemA1Id = crypto.randomUUID();
  const itemA2SoldOutId = crypto.randomUUID();
  const itemB1Id = crypto.randomUUID();

  let studentAToken: string;
  let studentBToken: string;
  let ownerAToken: string;
  let ownerBToken: string;

  beforeAll(async () => {
    // 1. Users
    await prisma.user.createMany({
      data: [
        {
          id: studentAId,
          email: `student_sched_a_${timestamp}@campus.edu`,
          phoneNumber: `+9181${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHashForOrderingTests',
          role: UserRole.STUDENT,
        },
        {
          id: studentBId,
          email: `student_sched_b_${timestamp}@campus.edu`,
          phoneNumber: `+9182${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHashForOrderingTests',
          role: UserRole.STUDENT,
        },
        {
          id: ownerAId,
          email: `owner_sched_a_${timestamp}@campus.edu`,
          phoneNumber: `+9183${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHashForOrderingTests',
          role: UserRole.STALL_OWNER,
        },
        {
          id: ownerBId,
          email: `owner_sched_b_${timestamp}@campus.edu`,
          phoneNumber: `+9184${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHashForOrderingTests',
          role: UserRole.STALL_OWNER,
        },
      ],
    });

    // 2. Student Profiles (Active & Verified)
    await prisma.studentProfile.createMany({
      data: [
        {
          userId: studentAId,
          fullName: 'Student Alice',
          universityRegNumber: `REG-A-${timestamp}`,
          accountStatus: StudentAccountStatus.ACTIVE,
        },
        {
          userId: studentBId,
          fullName: 'Student Bob',
          universityRegNumber: `REG-B-${timestamp}`,
          accountStatus: StudentAccountStatus.ACTIVE,
        },
      ],
    });

    // 3. Stalls with Operating Hours and Capacity
    await prisma.stall.createMany({
      data: [
        {
          id: stallAId,
          ownerId: ownerAId,
          name: `Scheduling Stall A ${timestamp}`,
          campusBlock: 'Block North',
          liveStatus: StallStatus.OPEN,
          processingMode: OrderProcessingMode.MANUAL,
          isApproved: true,
        },
        {
          id: stallBId,
          ownerId: ownerBId,
          name: `Capacity Stall B ${timestamp}`,
          campusBlock: 'Block South',
          liveStatus: StallStatus.OPEN,
          processingMode: OrderProcessingMode.AUTOMATIC,
          isApproved: true,
        },
      ],
    });

    // Operating hours: 00:00 to 23:59 everyday for test isolation
    for (let day = 0; day <= 6; day++) {
      await prisma.stallOperatingHour.createMany({
        data: [
          { stallId: stallAId, dayOfWeek: day, openTime: '00:00', closeTime: '23:59', isClosed: false },
          { stallId: stallBId, dayOfWeek: day, openTime: '00:00', closeTime: '23:59', isClosed: false },
        ],
      });
    }

    // Capacity: Stall A has high capacity (20), Stall B has tight capacity (1 active order)
    await prisma.stallCapacity.createMany({
      data: [
        {
          stallId: stallAId,
          maxActiveOrders: 20,
          parallelPreparationLimit: 4,
          operationalBufferMinutes: 2,
        },
        {
          stallId: stallBId,
          maxActiveOrders: 1, // Only 1 active order allowed!
          parallelPreparationLimit: 2,
          operationalBufferMinutes: 2,
        },
      ],
    });

    // 4. Menu Items & Inventories
    await prisma.menuItem.create({
      data: {
        id: itemA1Id,
        stallId: stallAId,
        name: 'Veg Noodles',
        price: 80.00,
        category: 'Noodles',
        preparationTimeMinutes: 10,
        availabilityState: ItemAvailabilityState.AVAILABLE,
        inventory: {
          create: { availableQuantity: 50, reservedQuantity: 0 },
        },
      },
    });

    await prisma.menuItem.create({
      data: {
        id: itemA2SoldOutId,
        stallId: stallAId,
        name: 'Special Chilli Paneer',
        price: 150.00,
        category: 'Starters',
        preparationTimeMinutes: 15,
        availabilityState: ItemAvailabilityState.SOLD_OUT, // Marked SOLD OUT!
        inventory: {
          create: { availableQuantity: 20, reservedQuantity: 0 },
        },
      },
    });

    await prisma.menuItem.create({
      data: {
        id: itemB1Id,
        stallId: stallBId,
        name: 'Masala Chai',
        price: 20.00,
        category: 'Beverages',
        preparationTimeMinutes: 5,
        availabilityState: ItemAvailabilityState.AVAILABLE,
        inventory: {
          create: { availableQuantity: 100, reservedQuantity: 0 },
        },
      },
    });

    // Tokens
    studentAToken = TokenService.generateTokens({ userId: studentAId, email: `student_sched_a_${timestamp}@campus.edu`, role: UserRole.STUDENT }).accessToken;
    studentBToken = TokenService.generateTokens({ userId: studentBId, email: `student_sched_b_${timestamp}@campus.edu`, role: UserRole.STUDENT }).accessToken;
    ownerAToken = TokenService.generateTokens({ userId: ownerAId, email: `owner_sched_a_${timestamp}@campus.edu`, role: UserRole.STALL_OWNER }).accessToken;
    ownerBToken = TokenService.generateTokens({ userId: ownerBId, email: `owner_sched_b_${timestamp}@campus.edu`, role: UserRole.STALL_OWNER }).accessToken;
  });

  afterAll(async () => {
    try {
      await prisma.notification.deleteMany({ where: { userId: { in: [studentAId, studentBId] } } });
      await prisma.pickupSchedule.deleteMany({});
      await prisma.orderItem.deleteMany({ where: { menuItemId: { in: [itemA1Id, itemA2SoldOutId, itemB1Id] } } });
      await prisma.subOrder.deleteMany({ where: { stallId: { in: [stallAId, stallBId] } } });
      await prisma.masterOrder.deleteMany({ where: { studentId: { in: [studentAId, studentBId] } } });
      await prisma.menuItemInventory.deleteMany({ where: { menuItemId: { in: [itemA1Id, itemA2SoldOutId, itemB1Id] } } });
      await prisma.menuItem.deleteMany({ where: { id: { in: [itemA1Id, itemA2SoldOutId, itemB1Id] } } });
      await prisma.stallCapacity.deleteMany({ where: { stallId: { in: [stallAId, stallBId] } } });
      await prisma.stallOperatingHour.deleteMany({ where: { stallId: { in: [stallAId, stallBId] } } });
      await prisma.stall.deleteMany({ where: { id: { in: [stallAId, stallBId] } } });
      await prisma.studentProfile.deleteMany({ where: { userId: { in: [studentAId, studentBId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [studentAId, studentBId, ownerAId, ownerBId] } } });
    } catch {
      // Ignore cleanup error
    }
  });

  test('UNAVAILABLE ITEM BARRIER: Checkout rejects item marked as SOLD_OUT with 400', async () => {
    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${studentAToken}`)
      .send({
        advancePercentage: 50,
        items: [
          { menuItemId: itemA2SoldOutId, quantity: 1 },
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.message).toContain('sold out');
  });

  test('AUTHORITATIVE PRICING: Backend ignores client manipulated prices and computes authoritative DB prices', async () => {
    // Student attempts to send price = 1.00 for item that costs 80.00
    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${studentAToken}`)
      .send({
        advancePercentage: 50,
        items: [
          { menuItemId: itemA1Id, quantity: 2, price: 1.00 } as any, // Client attempted price tampering
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    // Real price: 2 * 80.00 = 160.00, 50% advance = 80.00
    expect(res.body.data.totalAmount).toBe(160);
    expect(res.body.data.advanceAmount).toBe(80);
    expect(res.body.data.remainingAmount).toBe(80);
  });

  test('PICKUP SCHEDULING: Rejects infeasible requested pickup time with structured PICKUP_TIME_UNAVAILABLE', async () => {
    // Current time + 2 minutes (prep requires 10 min + 2 min buffer = 12 mins minimum)
    const tooEarlyTime = new Date(Date.now() + 2 * 60 * 1000).toISOString();

    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${studentAToken}`)
      .send({
        advancePercentage: 50,
        items: [
          { menuItemId: itemA1Id, quantity: 1 },
        ],
        requestedPickupTime: tooEarlyTime,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('PICKUP_TIME_UNAVAILABLE');
    expect(res.body.error.requestedTime).toBe(tooEarlyTime);
    expect(res.body.error.nextAvailableTime).toBeDefined();
    expect(new Date(res.body.error.nextAvailableTime).getTime()).toBeGreaterThan(new Date(tooEarlyTime).getTime());
  });

  test('PICKUP SCHEDULING: Accepts feasible requested pickup time', async () => {
    // Feasible time: 45 minutes in the future
    const feasibleTime = new Date(Date.now() + 45 * 60 * 1000).toISOString();

    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${studentAToken}`)
      .send({
        advancePercentage: 50,
        items: [
          { menuItemId: itemA1Id, quantity: 1 },
        ],
        requestedPickupTime: feasibleTime,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(new Date(res.body.data.subOrders[0].scheduledPickupTime).toISOString()).toBe(feasibleTime);
  });

  test('CAPACITY ENFORCEMENT: Stall B capacity limit (maxActiveOrders: 1) rejects second order when full', async () => {
    // Order 1 for Stall B: consumes the only capacity slot
    const res1 = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${studentAToken}`)
      .send({
        advancePercentage: 50,
        items: [{ menuItemId: itemB1Id, quantity: 1 }],
      });
    expect(res1.status).toBe(201);

    // Order 2 for Stall B: capacity is full (1 active order exists)
    const res2 = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${studentBToken}`)
      .send({
        advancePercentage: 50,
        items: [{ menuItemId: itemB1Id, quantity: 1 }],
      });

    expect(res2.status).toBe(409);
    expect(res2.body.success).toBe(false);
    expect(res2.body.error.code).toBe('CONFLICT');
    expect(res2.body.error.message).toContain('maximum kitchen capacity');
  });

  test('CONCURRENCY: Two simultaneous checkouts on last capacity slot allow exactly 1 and reject the other', async () => {
    // We clean up existing sub-orders on Stall B to have exactly 1 slot available
    await prisma.subOrder.deleteMany({ where: { stallId: stallBId } });

    // Buyer A and Buyer B fire simultaneous checkouts for Stall B (capacity: 1)
    const [resA, resB] = await Promise.all([
      request(app)
        .post('/api/v1/orders/checkout')
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({
          advancePercentage: 50,
          items: [{ menuItemId: itemB1Id, quantity: 1 }],
        }),
      request(app)
        .post('/api/v1/orders/checkout')
        .set('Authorization', `Bearer ${studentBToken}`)
        .send({
          advancePercentage: 50,
          items: [{ menuItemId: itemB1Id, quantity: 1 }],
        }),
    ]);

    const statuses = [resA.status, resB.status];
    expect(statuses).toContain(201);
    expect(statuses).toContain(409);

    // Verify only 1 active sub-order exists in PostgreSQL
    const activeSubOrders = await prisma.subOrder.findMany({ where: { stallId: stallBId } });
    expect(activeSubOrders).toHaveLength(1);
  });

  test('CONCURRENCY & IDEMPOTENCY: Concurrent identical checkout requests produce single order', async () => {
    const sharedIdempotencyKey = `idem_concur_${timestamp}_${Math.random()}`;

    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/v1/orders/checkout')
        .set('Authorization', `Bearer ${studentAToken}`)
        .set('Idempotency-Key', sharedIdempotencyKey)
        .send({
          advancePercentage: 50,
          items: [{ menuItemId: itemA1Id, quantity: 1 }],
        }),
      request(app)
        .post('/api/v1/orders/checkout')
        .set('Authorization', `Bearer ${studentAToken}`)
        .set('Idempotency-Key', sharedIdempotencyKey)
        .send({
          advancePercentage: 50,
          items: [{ menuItemId: itemA1Id, quantity: 1 }],
        }),
    ]);

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res1.body.data.masterOrderId).toBe(res2.body.data.masterOrderId);
    expect(res1.body.data.orderNumber).toBe(res2.body.data.orderNumber);
  });

  test('SUBORDER LIFECYCLE: Order transitions sequentially through CONFIRM -> PREPARE -> READY', async () => {
    // 1. Create fresh order on Stall A
    const checkoutRes = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${studentAToken}`)
      .send({
        advancePercentage: 50,
        items: [{ menuItemId: itemA1Id, quantity: 1 }],
      });

    const subOrderId = checkoutRes.body.data.subOrders[0].subOrderId;

    // Simulate gateway payment confirmation
    await prisma.subOrder.update({
      where: { id: subOrderId },
      data: { status: SubOrderStatus.PAYMENT_CONFIRMED },
    });

    // 2. Owner confirms order
    const confirmRes = await request(app)
      .post(`/api/v1/sub-orders/${subOrderId}/confirm`)
      .set('Authorization', `Bearer ${ownerAToken}`);
    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.data.status).toBe('CONFIRMED');

    // 3. Owner starts preparation
    const prepareRes = await request(app)
      .post(`/api/v1/sub-orders/${subOrderId}/prepare`)
      .set('Authorization', `Bearer ${ownerAToken}`);
    expect(prepareRes.status).toBe(200);
    expect(prepareRes.body.data.status).toBe('PREPARING');

    // 4. Owner marks food ready
    const readyRes = await request(app)
      .post(`/api/v1/sub-orders/${subOrderId}/ready`)
      .set('Authorization', `Bearer ${ownerAToken}`);
    expect(readyRes.status).toBe(200);
    expect(readyRes.body.data.status).toBe('READY');

    // 5. Verification notification was created for student
    const notifs = await prisma.notification.findMany({
      where: { userId: studentAId },
      orderBy: { createdAt: 'desc' },
    });
    expect(notifs.length).toBeGreaterThan(0);
    expect(notifs[0].title).toContain('Ready');
  });

  test('CROSS-STALL REJECTION ISOLATION: Rejecting SubOrder A preserves SubOrder B without cancelling master order', async () => {
    // Clean up Stall B capacity
    await prisma.subOrder.deleteMany({ where: { stallId: stallBId } });

    // Multi-stall checkout: 1 item from Stall A, 1 item from Stall B
    const checkoutRes = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${studentAToken}`)
      .send({
        advancePercentage: 50,
        items: [
          { menuItemId: itemA1Id, quantity: 1 },
          { menuItemId: itemB1Id, quantity: 1 },
        ],
      });

    expect(checkoutRes.status).toBe(201);
    const masterOrderId = checkoutRes.body.data.masterOrderId;
    const subOrders = checkoutRes.body.data.subOrders;
    expect(subOrders).toHaveLength(2);

    const subOrderA = subOrders.find((s: any) => s.stallId === stallAId)!;
    const subOrderB = subOrders.find((s: any) => s.stallId === stallBId)!;

    // Simulate payment confirmation
    await prisma.subOrder.updateMany({
      where: { id: { in: [subOrderA.subOrderId, subOrderB.subOrderId] } },
      data: { status: SubOrderStatus.PAYMENT_CONFIRMED },
    });

    // Stall A operator rejects SubOrder A due to sudden out-of-gas incident
    const rejectRes = await request(app)
      .post(`/api/v1/sub-orders/${subOrderA.subOrderId}/reject`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ reason: 'Kitchen gas burner failure' });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('REJECTED');
    expect(rejectRes.body.data.refundEligible).toBe(true);

    // Verify SubOrder B is completely untouched and valid
    const loadedSubOrderB = await prisma.subOrder.findUnique({
      where: { id: subOrderB.subOrderId },
    });
    expect(loadedSubOrderB!.status).toBe(SubOrderStatus.PAYMENT_CONFIRMED);

    // Verify MasterOrder was NOT completely cancelled
    const loadedMaster = await prisma.masterOrder.findUnique({
      where: { id: masterOrderId },
      include: { subOrders: true },
    });
    expect(loadedMaster).not.toBeNull();
    // SubOrder A is REJECTED, SubOrder B is PAYMENT_CONFIRMED
    const statuses = loadedMaster!.subOrders.map(s => s.status);
    expect(statuses).toContain('REJECTED');
    expect(statuses).toContain('PAYMENT_CONFIRMED');
  });
});
