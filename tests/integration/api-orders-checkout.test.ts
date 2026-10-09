import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../../src/app.js';
import { PrismaService } from '../../src/shared/infrastructure/PrismaService.js';
import { TokenService } from '../../src/modules/identity/domain/TokenService.js';
import { UserRole, StudentAccountStatus } from '../../src/modules/identity/domain/IdentityEnums.js';
import { StallStatus, OrderProcessingMode } from '../../src/modules/stall/domain/StallEnums.js';

describe('Order & Checkout Engine API Tests (/api/v1/orders/checkout)', () => {
  const app = createApp();
  const prisma = PrismaService.getClient();

  const timestamp = Date.now().toString(36);

  const verifiedStudentId = crypto.randomUUID();
  const unverifiedStudentId = crypto.randomUUID();
  const ownerId = crypto.randomUUID();

  const stallAId = crypto.randomUUID();
  const stallBId = crypto.randomUUID();

  const itemA1Id = crypto.randomUUID();
  const itemB1Id = crypto.randomUUID();

  let verifiedStudentToken: string;
  let unverifiedStudentToken: string;

  beforeAll(async () => {
    // 1. Users
    await prisma.user.createMany({
      data: [
        {
          id: verifiedStudentId,
          email: `verified_${timestamp}@campus.edu`,
          phoneNumber: `+9171${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHashForCheckoutTests',
          role: UserRole.STUDENT,
        },
        {
          id: unverifiedStudentId,
          email: `unverified_${timestamp}@campus.edu`,
          phoneNumber: `+9172${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHashForCheckoutTests',
          role: UserRole.STUDENT,
        },
        {
          id: ownerId,
          email: `owner_${timestamp}@campus.edu`,
          phoneNumber: `+9173${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHashForCheckoutTests',
          role: UserRole.STALL_OWNER,
        },
      ],
    });

    // 2. Profiles (one ACTIVE verified, one PENDING_VERIFICATION)
    await prisma.studentProfile.createMany({
      data: [
        {
          id: crypto.randomUUID(),
          userId: verifiedStudentId,
          fullName: 'Verified Student',
          universityRegNumber: `REG-VER-${timestamp}`,
          accountStatus: StudentAccountStatus.ACTIVE,
        },
        {
          id: crypto.randomUUID(),
          userId: unverifiedStudentId,
          fullName: 'Unverified Student',
          universityRegNumber: `REG-UNVER-${timestamp}`,
          accountStatus: StudentAccountStatus.PENDING_VERIFICATION,
        },
      ],
    });

    // 3. Stalls with capacity and operating hours
    await prisma.stall.createMany({
      data: [
        {
          id: stallAId,
          ownerId,
          name: `Stall Alpha ${timestamp}`,
          campusBlock: 'Block North',
          liveStatus: StallStatus.OPEN,
          processingMode: OrderProcessingMode.AUTOMATIC,
          isApproved: true,
        },
        {
          id: stallBId,
          ownerId,
          name: `Stall Beta ${timestamp}`,
          campusBlock: 'Block South',
          liveStatus: StallStatus.OPEN,
          processingMode: OrderProcessingMode.AUTOMATIC,
          isApproved: true,
        },
      ],
    });

    await prisma.stallCapacity.createMany({
      data: [
        { id: crypto.randomUUID(), stallId: stallAId },
        { id: crypto.randomUUID(), stallId: stallBId },
      ],
    });

    // Operating hours covering 00:00 - 23:59 every day so stall is always open for testing
    for (let day = 0; day <= 6; day++) {
      await prisma.stallOperatingHour.createMany({
        data: [
          { id: crypto.randomUUID(), stallId: stallAId, dayOfWeek: day, openTime: '00:00', closeTime: '23:59' },
          { id: crypto.randomUUID(), stallId: stallBId, dayOfWeek: day, openTime: '00:00', closeTime: '23:59' },
        ],
      });
    }

    // 4. Menu Items & Initial Stock
    await prisma.menuItem.createMany({
      data: [
        {
          id: itemA1Id,
          stallId: stallAId,
          name: 'Crispy Veg Roll',
          category: 'Rolls',
          price: 100.00,
          preparationTimeMinutes: 10,
        },
        {
          id: itemB1Id,
          stallId: stallBId,
          name: 'Cold Coffee',
          category: 'Beverages',
          price: 80.00,
          preparationTimeMinutes: 5,
        },
      ],
    });

    await prisma.menuItemInventory.createMany({
      data: [
        { id: crypto.randomUUID(), menuItemId: itemA1Id, availableQuantity: 20, reservedQuantity: 0 },
        { id: crypto.randomUUID(), menuItemId: itemB1Id, availableQuantity: 20, reservedQuantity: 0 },
      ],
    });

    // Tokens
    verifiedStudentToken = TokenService.generateTokens({
      userId: verifiedStudentId,
      role: UserRole.STUDENT,
      email: 'verified@campus.edu',
    }).accessToken;

    unverifiedStudentToken = TokenService.generateTokens({
      userId: unverifiedStudentId,
      role: UserRole.STUDENT,
      email: 'unverified@campus.edu',
    }).accessToken;
  });

  afterAll(async () => {
    // Delete created master orders & related records
    await prisma.masterOrder.deleteMany({
      where: { studentId: { in: [verifiedStudentId, unverifiedStudentId] } },
    });
    await prisma.menuItemInventory.deleteMany({
      where: { menuItemId: { in: [itemA1Id, itemB1Id] } },
    });
    await prisma.menuItem.deleteMany({
      where: { id: { in: [itemA1Id, itemB1Id] } },
    });
    await prisma.stallOperatingHour.deleteMany({
      where: { stallId: { in: [stallAId, stallBId] } },
    });
    await prisma.stallCapacity.deleteMany({
      where: { stallId: { in: [stallAId, stallBId] } },
    });
    await prisma.stall.deleteMany({
      where: { id: { in: [stallAId, stallBId] } },
    });
    await prisma.studentProfile.deleteMany({
      where: { userId: { in: [verifiedStudentId, unverifiedStudentId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [verifiedStudentId, unverifiedStudentId, ownerId] } },
    });
  });

  it('VERIFICATION GATE: unverified student checkout is rejected with 403 UNVERIFIED_STUDENT', async () => {
    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${unverifiedStudentToken}`)
      .send({
        advancePercentage: 50,
        items: [{ menuItemId: itemA1Id, quantity: 1 }],
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNVERIFIED_STUDENT');
  });

  it('CHECKOUT SUCCESS: verified student can checkout with valid 50% advance split', async () => {
    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${verifiedStudentToken}`)
      .send({
        advancePercentage: 50,
        items: [{ menuItemId: itemA1Id, quantity: 2 }], // 2 * 100 = 200
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalAmount).toBe(200);
    expect(res.body.data.advanceAmount).toBe(100);
    expect(res.body.data.remainingAmount).toBe(100);
    expect(res.body.data.advancePercentage).toBe(50);
    expect(res.body.data.subOrders).toHaveLength(1);
    expect(res.body.data.subOrders[0].stallId).toBe(stallAId);
  });

  it('MULTI-STALL CHECKOUT: atomic checkout across multiple stalls creates multi-suborders', async () => {
    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${verifiedStudentToken}`)
      .send({
        advancePercentage: 60,
        items: [
          { menuItemId: itemA1Id, quantity: 1 }, // 100
          { menuItemId: itemB1Id, quantity: 1 }, // 80
        ], // total = 180, 60% = 108, remaining = 72
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalAmount).toBe(180);
    expect(res.body.data.advanceAmount).toBe(108);
    expect(res.body.data.remainingAmount).toBe(72);
    expect(res.body.data.subOrders).toHaveLength(2);
  });

  it('IDEMPOTENT CHECKOUT: replaying same Idempotency-Key returns identical order without duplication', async () => {
    const testIdempotencyKey = `idem_checkout_${crypto.randomUUID()}`;

    // First request
    const res1 = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${verifiedStudentToken}`)
      .set('Idempotency-Key', testIdempotencyKey)
      .send({
        advancePercentage: 50,
        items: [{ menuItemId: itemB1Id, quantity: 1 }],
      });

    expect(res1.status).toBe(201);
    const orderId1 = res1.body.data.id;

    // Second request with identical key
    const res2 = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${verifiedStudentToken}`)
      .set('Idempotency-Key', testIdempotencyKey)
      .send({
        advancePercentage: 50,
        items: [{ menuItemId: itemB1Id, quantity: 1 }],
      });

    expect(res2.status).toBe(201);
    expect(res2.body.data.id).toBe(orderId1);
  });

  it('INSUFFICIENT STOCK: rejects checkout when requested quantity exceeds available inventory', async () => {
    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${verifiedStudentToken}`)
      .send({
        advancePercentage: 50,
        items: [{ menuItemId: itemA1Id, quantity: 9999 }], // Exceeds 20 stock
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('GET /api/v1/orders - lists authenticated student orders with pagination metadata', async () => {
    const res = await request(app)
      .get('/api/v1/orders?page=1&limit=10')
      .set('Authorization', `Bearer ${verifiedStudentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBe(10);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
  });
});
