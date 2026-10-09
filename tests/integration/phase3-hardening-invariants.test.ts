import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../../src/app.js';
import { PrismaService } from '../../src/shared/infrastructure/PrismaService.js';
import { TokenService } from '../../src/modules/identity/domain/TokenService.js';
import { UserRole, StudentAccountStatus } from '../../src/modules/identity/domain/IdentityEnums.js';
import { StallStatus, OrderProcessingMode, ItemAvailabilityState } from '../../src/modules/stall/domain/StallEnums.js';
import { SubOrderStatus, MasterOrderStatus } from '../../src/modules/ordering/domain/OrderEnums.js';

describe('Phase 3.1 Hardening & Invariant Verification', () => {
  const app = createApp();
  const prisma = PrismaService.getClient();

  const timestamp = Date.now().toString(36);
  const now = new Date();

  // Helper to construct UTC HH:MM offset relative to now
  const formatUtcTime = (d: Date) => 
    `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;

  // Stall B: Open 1 hour ago, closes in 30 minutes (currently OPEN, but closes soon)
  const stallBOpen = new Date(now.getTime() - 60 * 60 * 1000);
  const stallBClose = new Date(now.getTime() + 30 * 60 * 1000);
  const stallBOpenStr = formatUtcTime(stallBOpen);
  const stallBCloseStr = formatUtcTime(stallBClose);

  // Late pickup for Stall B: 2 hours from now (guaranteed after stallBClose)
  const latePickupB = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  // Stall D: Outside operating hours right now (opens 5 hours from now, closes 6 hours from now)
  const stallDOpen = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  const stallDClose = new Date(now.getTime() + 6 * 60 * 60 * 1000);

  const studentId = crypto.randomUUID();
  const ownerAId = crypto.randomUUID();
  const ownerBId = crypto.randomUUID();
  const ownerCId = crypto.randomUUID();
  const ownerDId = crypto.randomUUID();

  const stallAId = crypto.randomUUID(); // Open 00:00 - 23:59 (Always open)
  const stallBId = crypto.randomUUID(); // Closes soon (now + 30m)
  const stallCId = crypto.randomUUID(); // Open 00:00 - 23:59 (Always open)
  const stallDId = crypto.randomUUID(); // Currently outside operating hours

  const itemAId = crypto.randomUUID();
  const itemBId = crypto.randomUUID();
  const itemCId = crypto.randomUUID();
  const itemDId = crypto.randomUUID();

  let studentToken: string;
  let ownerAToken: string;
  let ownerBToken: string;
  let ownerCToken: string;

  beforeAll(async () => {
    // 1. Users
    await prisma.user.createMany({
      data: [
        {
          id: studentId,
          email: `student_hard_${timestamp}@campus.edu`,
          phoneNumber: `+9185${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHashForHardeningTests',
          role: UserRole.STUDENT,
        },
        {
          id: ownerAId,
          email: `owner_hard_a_${timestamp}@campus.edu`,
          phoneNumber: `+9186${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHashForHardeningTests',
          role: UserRole.STALL_OWNER,
        },
        {
          id: ownerBId,
          email: `owner_hard_b_${timestamp}@campus.edu`,
          phoneNumber: `+9187${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHashForHardeningTests',
          role: UserRole.STALL_OWNER,
        },
        {
          id: ownerCId,
          email: `owner_hard_c_${timestamp}@campus.edu`,
          phoneNumber: `+9188${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHashForHardeningTests',
          role: UserRole.STALL_OWNER,
        },
        {
          id: ownerDId,
          email: `owner_hard_d_${timestamp}@campus.edu`,
          phoneNumber: `+9189${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHashForHardeningTests',
          role: UserRole.STALL_OWNER,
        },
      ],
    });

    // 2. Student Profile (Active & Verified)
    await prisma.studentProfile.create({
      data: {
        userId: studentId,
        fullName: 'Student Hardening',
        universityRegNumber: `HARD-REG-${timestamp}`,
        accountStatus: StudentAccountStatus.ACTIVE,
      },
    });

    // 3. Stalls
    await prisma.stall.createMany({
      data: [
        {
          id: stallAId,
          ownerId: ownerAId,
          name: `AllDay Stall A ${timestamp}`,
          campusBlock: 'Block Central',
          liveStatus: StallStatus.OPEN,
          processingMode: OrderProcessingMode.MANUAL,
          isApproved: true,
        },
        {
          id: stallBId,
          ownerId: ownerBId,
          name: `ClosingSoon Stall B ${timestamp}`,
          campusBlock: 'Block East',
          liveStatus: StallStatus.OPEN,
          processingMode: OrderProcessingMode.MANUAL,
          isApproved: true,
        },
        {
          id: stallCId,
          ownerId: ownerCId,
          name: `AllDay Stall C ${timestamp}`,
          campusBlock: 'Block West',
          liveStatus: StallStatus.OPEN,
          processingMode: OrderProcessingMode.MANUAL,
          isApproved: true,
        },
        {
          id: stallDId,
          ownerId: ownerDId,
          name: `ClosedNow Stall D ${timestamp}`,
          campusBlock: 'Block North',
          liveStatus: StallStatus.OPEN,
          processingMode: OrderProcessingMode.MANUAL,
          isApproved: true,
        },
      ],
    });

    // Operating hours
    for (let day = 0; day <= 6; day++) {
      await prisma.stallOperatingHour.createMany({
        data: [
          {
            stallId: stallAId,
            dayOfWeek: day,
            openTime: '00:00',
            closeTime: '23:59',
            isClosed: false,
          },
          {
            stallId: stallBId,
            dayOfWeek: day,
            openTime: stallBOpenStr,
            closeTime: stallBCloseStr,
            isClosed: false,
          },
          {
            stallId: stallCId,
            dayOfWeek: day,
            openTime: '00:00',
            closeTime: '23:59',
            isClosed: false,
          },
          {
            stallId: stallDId,
            dayOfWeek: day,
            openTime: formatUtcTime(stallDOpen),
            closeTime: formatUtcTime(stallDClose),
            isClosed: false,
          },
        ],
      });
    }

    // Capacity
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
          maxActiveOrders: 10,
          parallelPreparationLimit: 2,
          operationalBufferMinutes: 2,
        },
        {
          stallId: stallCId,
          maxActiveOrders: 20,
          parallelPreparationLimit: 4,
          operationalBufferMinutes: 2,
        },
        {
          stallId: stallDId,
          maxActiveOrders: 10,
          parallelPreparationLimit: 2,
          operationalBufferMinutes: 2,
        },
      ],
    });

    // Menu items
    await prisma.menuItem.create({
      data: {
        id: itemAId,
        stallId: stallAId,
        name: 'Hardening Samosa',
        category: 'Snacks',
        price: 25.00,
        preparationTimeMinutes: 10,
        availabilityState: ItemAvailabilityState.AVAILABLE,
        inventory: {
          create: { availableQuantity: 10, reservedQuantity: 0 },
        },
      },
    });

    await prisma.menuItem.create({
      data: {
        id: itemBId,
        stallId: stallBId,
        name: 'Lunch Thali',
        category: 'Meals',
        price: 120.00,
        preparationTimeMinutes: 15,
        availabilityState: ItemAvailabilityState.AVAILABLE,
        inventory: {
          create: { availableQuantity: 10, reservedQuantity: 0 },
        },
      },
    });

    await prisma.menuItem.create({
      data: {
        id: itemCId,
        stallId: stallCId,
        name: 'Cold Coffee',
        category: 'Beverages',
        price: 45.00,
        preparationTimeMinutes: 5,
        availabilityState: ItemAvailabilityState.AVAILABLE,
        inventory: {
          create: { availableQuantity: 10, reservedQuantity: 0 },
        },
      },
    });

    await prisma.menuItem.create({
      data: {
        id: itemDId,
        stallId: stallDId,
        name: 'Midnight Burger',
        category: 'Burgers',
        price: 90.00,
        preparationTimeMinutes: 10,
        availabilityState: ItemAvailabilityState.AVAILABLE,
        inventory: {
          create: { availableQuantity: 10, reservedQuantity: 0 },
        },
      },
    });

    // Generate tokens
    studentToken = TokenService.generateTokens({
      userId: studentId,
      email: `student_hard_${timestamp}@campus.edu`,
      role: UserRole.STUDENT,
    }).accessToken;

    ownerAToken = TokenService.generateTokens({
      userId: ownerAId,
      email: `owner_hard_a_${timestamp}@campus.edu`,
      role: UserRole.STALL_OWNER,
    }).accessToken;

    ownerBToken = TokenService.generateTokens({
      userId: ownerBId,
      email: `owner_hard_b_${timestamp}@campus.edu`,
      role: UserRole.STALL_OWNER,
    }).accessToken;

    ownerCToken = TokenService.generateTokens({
      userId: ownerCId,
      email: `owner_hard_c_${timestamp}@campus.edu`,
      role: UserRole.STALL_OWNER,
    }).accessToken;
  });

  afterAll(async () => {
    try {
      await prisma.notification.deleteMany({ where: { userId: studentId } });
      await prisma.pickupSchedule.deleteMany({});
      await prisma.orderItem.deleteMany({ where: { menuItemId: { in: [itemAId, itemBId, itemCId, itemDId] } } });
      await prisma.subOrder.deleteMany({ where: { stallId: { in: [stallAId, stallBId, stallCId, stallDId] } } });
      await prisma.masterOrder.deleteMany({ where: { studentId } });
      await prisma.menuItemInventory.deleteMany({ where: { menuItemId: { in: [itemAId, itemBId, itemCId, itemDId] } } });
      await prisma.menuItem.deleteMany({ where: { id: { in: [itemAId, itemBId, itemCId, itemDId] } } });
      await prisma.stallCapacity.deleteMany({ where: { stallId: { in: [stallAId, stallBId, stallCId, stallDId] } } });
      await prisma.stallOperatingHour.deleteMany({ where: { stallId: { in: [stallAId, stallBId, stallCId, stallDId] } } });
      await prisma.stall.deleteMany({ where: { id: { in: [stallAId, stallBId, stallCId, stallDId] } } });
      await prisma.studentProfile.deleteMany({ where: { userId: studentId } });
      await prisma.refreshSession.deleteMany({ where: { userId: { in: [studentId, ownerAId, ownerBId, ownerCId, ownerDId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [studentId, ownerAId, ownerBId, ownerCId, ownerDId] } } });
    } catch {
      // Ignore cleanup error
    }
  });

  describe('1. Inventory Rollback Across Multi-Stall Transaction Boundary', () => {
    it('rolls back Stall A reserved inventory when Stall B checkout fails due to closing time', async () => {
      // Before checkout: verify Stall A has 10 available, 0 reserved
      const stockBefore = await prisma.menuItemInventory.findUnique({
        where: { menuItemId: itemAId },
      });
      expect(stockBefore?.availableQuantity).toBe(10);
      expect(stockBefore?.reservedQuantity).toBe(0);

      // Multi-stall checkout: Stall A + Stall B, with pickup at latePickupB (after Stall B closes)
      const idempotencyKey = crypto.randomUUID();

      const res = await request(app)
        .post('/api/v1/orders/checkout')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          advancePercentage: 50,
          requestedPickupTime: latePickupB.toISOString(),
          items: [
            { menuItemId: itemAId, quantity: 3 },
            { menuItemId: itemBId, quantity: 2 },
          ],
        });

      // Checkout must be rejected with PICKUP_TIME_UNAVAILABLE because Stall B is closed at that time
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PICKUP_TIME_UNAVAILABLE');

      // CRITICAL ASSERTION: Stall A's 3 units MUST have been rolled back cleanly!
      const stockAfter = await prisma.menuItemInventory.findUnique({
        where: { menuItemId: itemAId },
      });
      expect(stockAfter?.availableQuantity).toBe(10); // NOT 7!
      expect(stockAfter?.reservedQuantity).toBe(0);  // NOT 3!

      // Assert no partial orders were persisted
      const orders = await prisma.masterOrder.findMany({
        where: { studentId },
      });
      expect(orders).toHaveLength(0);

      // Assert in-flight idempotency record was deleted so student can immediately retry
      const idemRecord = await prisma.idempotencyRecord.findUnique({
        where: { key: idempotencyKey },
      });
      expect(idemRecord).toBeNull();
    });
  });

  describe('2. Pickup Scheduling Edge Cases & Operating Hours Semantics', () => {
    it('rejects requested pickup time that is after stall closing time with next available time', async () => {
      const res = await request(app)
        .post('/api/v1/orders/checkout')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          advancePercentage: 50,
          requestedPickupTime: latePickupB.toISOString(),
          items: [{ menuItemId: itemBId, quantity: 1 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PICKUP_TIME_UNAVAILABLE');
      expect(res.body.error.nextAvailableTime).toBeDefined();
    });

    it('rejects checkout when stall is currently outside operating hours', async () => {
      // Stall D is currently closed (opens in 5 hours)
      const res = await request(app)
        .post('/api/v1/orders/checkout')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          advancePercentage: 50,
          items: [{ menuItemId: itemDId, quantity: 1 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toMatch(/outside official campus operating hours/i);
    });

    it('accepts feasible pickup time within operating hours and creates schedule', async () => {
      const validPickup = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now (exceeds 12m prep+buffer)

      const res = await request(app)
        .post('/api/v1/orders/checkout')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          advancePercentage: 50,
          requestedPickupTime: validPickup.toISOString(),
          items: [{ menuItemId: itemAId, quantity: 1 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.subOrders[0].scheduledPickupTime).toBeDefined();
    });
  });

  describe('3. Dynamic MasterOrder Status Derivation', () => {
    it('authoritatively derives PARTIALLY_FULFILLED when SubOrder C is rejected while SubOrder A is preparing/ready', async () => {
      // Place a 2-stall order (Stall A and Stall C, both open 24/7)
      const res = await request(app)
        .post('/api/v1/orders/checkout')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          advancePercentage: 50,
          items: [
            { menuItemId: itemAId, quantity: 1 },
            { menuItemId: itemCId, quantity: 1 },
          ],
        });

      expect(res.status).toBe(201);
      const masterOrderId = res.body.data.masterOrderId;
      const subOrders = res.body.data.subOrders;
      expect(subOrders).toHaveLength(2);

      const subOrderAId = subOrders.find((s: any) => s.stallId === stallAId).subOrderId;
      const subOrderCId = subOrders.find((s: any) => s.stallId === stallCId).subOrderId;

      // Advance suborders to PAYMENT_CONFIRMED so stall operators can accept/reject
      await prisma.subOrder.updateMany({
        where: { id: { in: [subOrderAId, subOrderCId] } },
        data: { status: SubOrderStatus.PAYMENT_CONFIRMED },
      });

      // Stall C owner rejects their sub-order due to kitchen surge
      const rejectRes = await request(app)
        .post(`/api/v1/orders/suborder/${subOrderCId}/reject`)
        .set('Authorization', `Bearer ${ownerCToken}`)
        .send({ reason: 'Kitchen capacity surge' });
      expect(rejectRes.status).toBe(200);

      // Stall A owner confirms and prepares their sub-order
      const confirmRes = await request(app)
        .post(`/api/v1/orders/suborder/${subOrderAId}/confirm`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({});
      expect(confirmRes.status).toBe(200);

      const prepRes = await request(app)
        .post(`/api/v1/orders/suborder/${subOrderAId}/prepare`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({});
      expect(prepRes.status).toBe(200);

      // Student queries master order:
      // SubOrder C is REJECTED, SubOrder A is PREPARING.
      // MasterOrder MUST dynamically derive PARTIALLY_FULFILLED!
      const queryRes = await request(app)
        .get(`/api/v1/orders/${masterOrderId}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(queryRes.status).toBe(200);
      expect(queryRes.body.data.status).toBe(MasterOrderStatus.PARTIALLY_FULFILLED);
    });
  });

  describe('4. Counter Settlement Payment-State Semantics', () => {
    it('verifies counter settlement is an internal payment transition restricted to authorized staff', async () => {
      // Place order at 50% advance
      const res = await request(app)
        .post('/api/v1/orders/checkout')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('Idempotency-Key', crypto.randomUUID())
        .send({
          advancePercentage: 50,
          items: [{ menuItemId: itemAId, quantity: 2 }],
        });

      expect(res.status).toBe(201);
      const subOrderId = res.body.data.subOrders[0].subOrderId;
      expect(res.body.data.subOrders[0].balanceDue).toBeGreaterThan(0);

      // Advance to PAYMENT_CONFIRMED so kitchen can process
      await prisma.subOrder.update({
        where: { id: subOrderId },
        data: { status: SubOrderStatus.PAYMENT_CONFIRMED },
      });

      // Progress order to READY
      await request(app)
        .post(`/api/v1/orders/suborder/${subOrderId}/confirm`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({});

      await request(app)
        .post(`/api/v1/orders/suborder/${subOrderId}/prepare`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({});

      await request(app)
        .post(`/api/v1/orders/suborder/${subOrderId}/ready`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({});

      // Attempt 1: Student tries to mark counter cash payment -> Rejected (403)
      const studentAttempt = await request(app)
        .post(`/api/v1/orders/suborder/${subOrderId}/counter-settlement`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ paymentMethod: 'CASH' });

      expect(studentAttempt.status).toBe(403);
      expect(studentAttempt.body.error.message).toMatch(/students cannot self-declare counter settlements/i);

      // Attempt 2: Pickup collection before counter balance settlement -> Rejected (400)
      const prematureCollection = await request(app)
        .post(`/api/v1/orders/suborder/${subOrderId}/collect`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({});

      expect(prematureCollection.status).toBe(400);
      expect(prematureCollection.body.error.message).toMatch(/Remaining balance must be settled/i);

      // Attempt 3: Stall Owner records in-person cash settlement
      const settlementRes = await request(app)
        .post(`/api/v1/orders/suborder/${subOrderId}/counter-settlement`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ paymentMethod: 'CASH', notes: 'Paid at counter window 1' });

      expect(settlementRes.status).toBe(200);
      expect(settlementRes.body.success).toBe(true);
      expect(settlementRes.body.data.isBalancePaid).toBe(true);

      // Attempt 4: Pickup collection now succeeds
      const validCollection = await request(app)
        .post(`/api/v1/orders/suborder/${subOrderId}/collect`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({});

      expect(validCollection.status).toBe(200);
      expect(validCollection.body.data.status).toBe(SubOrderStatus.COLLECTED);

      // Attempt 5: Duplicate counter settlement is rejected
      const duplicateSettlement = await request(app)
        .post(`/api/v1/orders/suborder/${subOrderId}/counter-settlement`)
        .set('Authorization', `Bearer ${ownerAToken}`)
        .send({ paymentMethod: 'CASH' });

      expect(duplicateSettlement.status).toBe(400);
      expect(duplicateSettlement.body.error.message).toMatch(/already settled/i);
    });
  });
});
