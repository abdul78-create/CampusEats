import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../../src/app.js';
import { PrismaService } from '../../src/shared/infrastructure/PrismaService.js';
import { TokenService } from '../../src/modules/identity/domain/TokenService.js';
import { UserRole } from '../../src/modules/identity/domain/IdentityEnums.js';
import { StallStatus, OrderProcessingMode } from '../../src/modules/stall/domain/StallEnums.js';

describe('Stall & Menu Management API Tests (Phase 3)', () => {
  const app = createApp();
  const prisma = PrismaService.getClient();

  const timestamp = Date.now().toString(36);

  const ownerAId = crypto.randomUUID();
  const ownerBId = crypto.randomUUID();
  const studentId = crypto.randomUUID();

  const stallAId = crypto.randomUUID();
  const stallBId = crypto.randomUUID();

  let ownerAToken: string;
  let ownerBToken: string;
  let studentToken: string;

  let menuItemAId: string;

  beforeAll(async () => {
    // 1. Create Users
    await prisma.user.createMany({
      data: [
        {
          id: ownerAId,
          email: `ownerA_${timestamp}@campus.edu`,
          phoneNumber: `+9171${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHashForMenuTests',
          role: UserRole.STALL_OWNER,
        },
        {
          id: ownerBId,
          email: `ownerB_${timestamp}@campus.edu`,
          phoneNumber: `+9172${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHashForMenuTests',
          role: UserRole.STALL_OWNER,
        },
        {
          id: studentId,
          email: `student_menu_${timestamp}@campus.edu`,
          phoneNumber: `+9173${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHashForMenuTests',
          role: UserRole.STUDENT,
        },
      ],
    });

    // 2. Create Stalls
    await prisma.stall.createMany({
      data: [
        {
          id: stallAId,
          ownerId: ownerAId,
          name: `Stall A ${timestamp}`,
          campusBlock: 'Block North',
          liveStatus: StallStatus.OPEN,
          processingMode: OrderProcessingMode.MANUAL,
          isApproved: true,
        },
        {
          id: stallBId,
          ownerId: ownerBId,
          name: `Stall B ${timestamp}`,
          campusBlock: 'Block South',
          liveStatus: StallStatus.OPEN,
          processingMode: OrderProcessingMode.AUTOMATIC,
          isApproved: true,
        },
      ],
    });

    // 3. Capacities
    await prisma.stallCapacity.createMany({
      data: [
        {
          stallId: stallAId,
          maxActiveOrders: 15,
          parallelPreparationLimit: 3,
          operationalBufferMinutes: 2,
        },
        {
          stallId: stallBId,
          maxActiveOrders: 20,
          parallelPreparationLimit: 4,
          operationalBufferMinutes: 2,
        },
      ],
    });

    // 4. Generate Auth Tokens
    ownerAToken = TokenService.generateTokens({ userId: ownerAId, email: `ownerA_${timestamp}@campus.edu`, role: UserRole.STALL_OWNER }).accessToken;
    ownerBToken = TokenService.generateTokens({ userId: ownerBId, email: `ownerB_${timestamp}@campus.edu`, role: UserRole.STALL_OWNER }).accessToken;
    studentToken = TokenService.generateTokens({ userId: studentId, email: `student_menu_${timestamp}@campus.edu`, role: UserRole.STUDENT }).accessToken;
  });

  afterAll(async () => {
    try {
      await prisma.menuItemInventory.deleteMany({ where: { menuItem: { stallId: { in: [stallAId, stallBId] } } } });
      await prisma.menuItem.deleteMany({ where: { stallId: { in: [stallAId, stallBId] } } });
      await prisma.stallCapacity.deleteMany({ where: { stallId: { in: [stallAId, stallBId] } } });
      await prisma.stall.deleteMany({ where: { id: { in: [stallAId, stallBId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [ownerAId, ownerBId, studentId] } } });
    } catch {
      // Ignore cleanup error
    }
  });

  test('POST /api/v1/owner/stall/menu - Stall owner creates a new menu item with initial inventory', async () => {
    const res = await request(app)
      .post('/api/v1/owner/stall/menu')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        name: 'Paneer Butter Masala Roll',
        description: 'Spicy marinated paneer wrapped in freshly baked paratha',
        price: 90.00,
        category: 'Rolls',
        isVegetarian: true,
        preparationTimeMinutes: 10,
        availableQuantity: 25,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Paneer Butter Masala Roll');
    expect(res.body.data.price).toBe(90);
    expect(res.body.data.availableQuantity).toBe(25);
    expect(res.body.data.availabilityState).toBe('AVAILABLE');

    menuItemAId = res.body.data.id;
  });

  test('GET /api/v1/owner/stall/menu - Stall owner retrieves their stall menu items', async () => {
    const res = await request(app)
      .get('/api/v1/owner/stall/menu')
      .set('Authorization', `Bearer ${ownerAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((i: any) => i.id === menuItemAId)).toBe(true);
  });

  test('PATCH /api/v1/owner/stall/menu/:itemId - Stall owner updates item price and prep time', async () => {
    const res = await request(app)
      .patch(`/api/v1/owner/stall/menu/${menuItemAId}`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        price: 110.00,
        preparationTimeMinutes: 12,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.price).toBe(110);
    expect(res.body.data.preparationTimeMinutes).toBe(12);
  });

  test('PATCH /api/v1/owner/stall/capacity - Stall owner updates stall capacity model', async () => {
    const res = await request(app)
      .patch('/api/v1/owner/stall/capacity')
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        maxActiveOrders: 30,
        parallelPreparationLimit: 5,
        operationalBufferMinutes: 3,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.capacity.maxActiveOrders).toBe(30);
    expect(res.body.data.capacity.parallelPreparationLimit).toBe(5);
    expect(res.body.data.capacity.operationalBufferMinutes).toBe(3);
  });

  test('PATCH /api/v1/owner/stall/menu/:itemId/availability - Stall owner marks item as SOLD_OUT', async () => {
    const res = await request(app)
      .patch(`/api/v1/owner/stall/menu/${menuItemAId}/availability`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({
        availabilityState: 'SOLD_OUT',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.availabilityState).toBe('SOLD_OUT');
    expect(res.body.data.isSoldOut).toBe(true);
  });

  test('STUDENT ACCESS: Student views stall menu with sold-out status reflected', async () => {
    const res = await request(app)
      .get(`/api/v1/stalls/${stallAId}/menu`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const item = res.body.data.find((i: any) => i.id === menuItemAId);
    expect(item).toBeDefined();
    expect(item.price).toBe(110);
    expect(item.isSoldOut).toBe(true);
  });

  test('SECURITY BARRIER: Student cannot create, modify, or delete menu items', async () => {
    // 1. Student creates item
    const postRes = await request(app)
      .post('/api/v1/owner/stall/menu')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ name: 'Hacked Item', price: 10, category: 'Snacks' });
    expect(postRes.status).toBe(403);

    // 2. Student updates item
    const patchRes = await request(app)
      .patch(`/api/v1/owner/stall/menu/${menuItemAId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ price: 1.00 });
    expect(patchRes.status).toBe(403);

    // 3. Student deletes item
    const deleteRes = await request(app)
      .delete(`/api/v1/owner/stall/menu/${menuItemAId}`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(deleteRes.status).toBe(403);
  });

  test('BOLA / IDOR DEFENSE: Stall Owner B cannot modify or delete Stall Owner A menu item', async () => {
    // Owner B tries to mutate Owner A's item price
    const patchRes = await request(app)
      .patch(`/api/v1/owner/stall/menu/${menuItemAId}`)
      .set('Authorization', `Bearer ${ownerBToken}`)
      .send({ price: 1.00 });

    expect(patchRes.status).toBe(403);
    expect(patchRes.body.error.code).toBe('FORBIDDEN');

    // Owner B tries to delete Owner A's item
    const deleteRes = await request(app)
      .delete(`/api/v1/owner/stall/menu/${menuItemAId}`)
      .set('Authorization', `Bearer ${ownerBToken}`);

    expect(deleteRes.status).toBe(403);
    expect(deleteRes.body.error.code).toBe('FORBIDDEN');
  });

  test('DELETE /api/v1/owner/stall/menu/:itemId - Stall Owner A soft-deletes their item', async () => {
    const res = await request(app)
      .delete(`/api/v1/owner/stall/menu/${menuItemAId}`)
      .set('Authorization', `Bearer ${ownerAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify it is no longer listed in active menu
    const menuRes = await request(app)
      .get(`/api/v1/stalls/${stallAId}/menu`);
    expect(menuRes.body.data.some((i: any) => i.id === menuItemAId)).toBe(false);
  });
});
