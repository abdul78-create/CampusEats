import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../../src/app.js';
import { PrismaService } from '../../src/shared/infrastructure/PrismaService.js';
import { TokenService } from '../../src/modules/identity/domain/TokenService.js';
import { UserRole, StudentAccountStatus } from '../../src/modules/identity/domain/IdentityEnums.js';
import { StallStatus, OrderProcessingMode } from '../../src/modules/stall/domain/StallEnums.js';
import { MasterOrderStatus, SubOrderStatus } from '../../src/modules/ordering/domain/OrderEnums.js';

describe('BOLA / IDOR Defense & Multi-Tenant Authorization API Tests', () => {
  const app = createApp();
  const prisma = PrismaService.getClient();

  const timestamp = Date.now().toString(36);

  // Valid UUIDs for all entities
  const studentAId = crypto.randomUUID();
  const studentBId = crypto.randomUUID();
  const ownerAId = crypto.randomUUID();
  const ownerBId = crypto.randomUUID();
  const staffAId = crypto.randomUUID();
  const adminId = crypto.randomUUID();

  const stallAId = crypto.randomUUID();
  const stallBId = crypto.randomUUID();
  const itemAId = crypto.randomUUID();
  const itemBId = crypto.randomUUID();

  const masterOrderId = crypto.randomUUID();
  const subOrderId = crypto.randomUUID();

  let studentAToken: string;
  let studentBToken: string;
  let ownerAToken: string;
  let ownerBToken: string;
  let staffAToken: string;
  let adminToken: string;

  beforeAll(async () => {
    // 1. Create Users
    await prisma.user.createMany({
      data: [
        {
          id: studentAId,
          email: `studentA_${timestamp}@campus.edu`,
          phoneNumber: `+9181${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHashForAuthTests',
          role: UserRole.STUDENT,
        },
        {
          id: studentBId,
          email: `studentB_${timestamp}@campus.edu`,
          phoneNumber: `+9182${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHashForAuthTests',
          role: UserRole.STUDENT,
        },
        {
          id: ownerAId,
          email: `ownerA_${timestamp}@campus.edu`,
          phoneNumber: `+9183${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHashForAuthTests',
          role: UserRole.STALL_OWNER,
        },
        {
          id: ownerBId,
          email: `ownerB_${timestamp}@campus.edu`,
          phoneNumber: `+9184${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHashForAuthTests',
          role: UserRole.STALL_OWNER,
        },
        {
          id: staffAId,
          email: `staffA_${timestamp}@campus.edu`,
          phoneNumber: `+9185${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHashForAuthTests',
          role: UserRole.STALL_STAFF,
        },
        {
          id: adminId,
          email: `admin_${timestamp}@campus.edu`,
          phoneNumber: `+9186${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: '$2b$12$secureMockHashForAuthTests',
          role: UserRole.ADMIN,
        },
      ],
    });

    // Student Profiles
    await prisma.studentProfile.createMany({
      data: [
        {
          id: crypto.randomUUID(),
          userId: studentAId,
          fullName: 'Student A',
          universityRegNumber: `REG-A-${timestamp}`,
          accountStatus: StudentAccountStatus.ACTIVE,
        },
        {
          id: crypto.randomUUID(),
          userId: studentBId,
          fullName: 'Student B',
          universityRegNumber: `REG-B-${timestamp}`,
          accountStatus: StudentAccountStatus.ACTIVE,
        },
      ],
    });

    // Stalls
    await prisma.stall.createMany({
      data: [
        {
          id: stallAId,
          ownerId: ownerAId,
          name: `Stall A ${timestamp}`,
          campusBlock: 'Block 1',
          liveStatus: StallStatus.OPEN,
          processingMode: OrderProcessingMode.AUTOMATIC,
          isApproved: true,
        },
        {
          id: stallBId,
          ownerId: ownerBId,
          name: `Stall B ${timestamp}`,
          campusBlock: 'Block 2',
          liveStatus: StallStatus.OPEN,
          processingMode: OrderProcessingMode.AUTOMATIC,
          isApproved: true,
        },
      ],
    });

    // Staff Account (Stall A, permissions: MANAGE_ORDERS only - lacking VIEW_PAYMENTS)
    await prisma.staffAccount.create({
      data: {
        id: crypto.randomUUID(),
        userId: staffAId,
        stallId: stallAId,
        permissions: {
          create: [
            {
              id: crypto.randomUUID(),
              permission: 'MANAGE_ORDERS',
            },
          ],
        },
      },
    });

    // Menu Items & Inventory
    await prisma.menuItem.createMany({
      data: [
        {
          id: itemAId,
          stallId: stallAId,
          name: 'Samosa Stall A',
          category: 'Snacks',
          price: 20.00,
          preparationTimeMinutes: 5,
        },
        {
          id: itemBId,
          stallId: stallBId,
          name: 'Dosa Stall B',
          category: 'Breakfast',
          price: 60.00,
          preparationTimeMinutes: 10,
        },
      ],
    });

    await prisma.menuItemInventory.createMany({
      data: [
        { id: crypto.randomUUID(), menuItemId: itemAId, availableQuantity: 50, reservedQuantity: 0 },
        { id: crypto.randomUUID(), menuItemId: itemBId, availableQuantity: 50, reservedQuantity: 0 },
      ],
    });

    // MasterOrder & SubOrder belonging to Student B on Stall A
    await prisma.masterOrder.create({
      data: {
        id: masterOrderId,
        orderNumber: `ORD-${timestamp}`,
        studentId: studentBId,
        advancePercentage: 50,
        totalAmount: 100.00,
        advanceAmount: 50.00,
        remainingAmount: 50.00,
        status: MasterOrderStatus.PAYMENT_CONFIRMED,
        subOrders: {
          create: [
            {
              id: subOrderId,
              subOrderNumber: `SUB-${timestamp}`,
              stallId: stallAId,
              subtotalAmount: 100.00,
              advancePaidAmount: 50.00,
              balanceDueAmount: 50.00,
              isBalancePaid: false,
              status: SubOrderStatus.READY,
            },
          ],
        },
      },
    });

    // Tokens
    studentAToken = TokenService.generateTokens({ userId: studentAId, role: UserRole.STUDENT, email: 'studA@campus.edu' }).accessToken;
    studentBToken = TokenService.generateTokens({ userId: studentBId, role: UserRole.STUDENT, email: 'studB@campus.edu' }).accessToken;
    ownerAToken = TokenService.generateTokens({ userId: ownerAId, role: UserRole.STALL_OWNER, email: 'ownA@campus.edu' }).accessToken;
    ownerBToken = TokenService.generateTokens({ userId: ownerBId, role: UserRole.STALL_OWNER, email: 'ownB@campus.edu' }).accessToken;
    staffAToken = TokenService.generateTokens({ userId: staffAId, role: UserRole.STALL_STAFF, email: 'stfA@campus.edu' }).accessToken;
    adminToken = TokenService.generateTokens({ userId: adminId, role: UserRole.ADMIN, email: 'admin@campus.edu' }).accessToken;
  });

  afterAll(async () => {
    // Cleanup created test records
    await prisma.masterOrder.deleteMany({ where: { id: masterOrderId } });
    await prisma.menuItemInventory.deleteMany({ where: { menuItemId: { in: [itemAId, itemBId] } } });
    await prisma.menuItem.deleteMany({ where: { id: { in: [itemAId, itemBId] } } });
    await prisma.staffAccount.deleteMany({ where: { userId: staffAId } });
    await prisma.stall.deleteMany({ where: { id: { in: [stallAId, stallBId] } } });
    await prisma.studentProfile.deleteMany({ where: { userId: { in: [studentAId, studentBId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [studentAId, studentBId, ownerAId, ownerBId, staffAId, adminId] } } });
  });

  // ==========================================
  // STUDENT IDOR DEFENSE
  // ==========================================

  it('STUDENT IDOR: Student A cannot access Student B order via GET /api/v1/orders/:id', async () => {
    const res = await request(app)
      .get(`/api/v1/orders/${masterOrderId}`)
      .set('Authorization', `Bearer ${studentAToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('cannot access another student');
  });

  it('STUDENT IDOR: Student B can access their own order via GET /api/v1/orders/:id', async () => {
    const res = await request(app)
      .get(`/api/v1/orders/${masterOrderId}`)
      .set('Authorization', `Bearer ${studentBToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(masterOrderId);
    expect(res.body.data.studentId).toBe(studentBId);
  });

  it('STUDENT COLLECTION BAR: Student B cannot mark order as COLLECTED', async () => {
    const res = await request(app)
      .post(`/api/v1/sub-orders/${subOrderId}/collect`)
      .set('Authorization', `Bearer ${studentBToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toBe('Students cannot mark orders as collected');
  });

  it('STUDENT COUNTER BAR: Student B cannot self-declare counter cash settlement', async () => {
    const res = await request(app)
      .post(`/api/v1/sub-orders/${subOrderId}/counter-settlement`)
      .set('Authorization', `Bearer ${studentBToken}`)
      .send({ paymentMethod: 'CASH' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toBe('Students cannot self-declare counter settlements');
  });

  // ==========================================
  // STALL OWNER BOLA DEFENSE
  // ==========================================

  it('OWNER BOLA: Stall Owner B cannot modify inventory for Stall A item', async () => {
    const res = await request(app)
      .patch(`/api/v1/owner/inventory/${itemAId}`)
      .set('Authorization', `Bearer ${ownerBToken}`)
      .send({ availableQuantity: 10 });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('only modify inventory for your own stall');
  });

  it('OWNER BOLA: Stall Owner A can modify inventory for their own item', async () => {
    const res = await request(app)
      .patch(`/api/v1/owner/inventory/${itemAId}`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ availableQuantity: 42 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.availableQuantity).toBe(42);
  });

  // ==========================================
  // STAFF PERMISSIONS & TENANT ISOLATION
  // ==========================================

  it('STAFF PERMISSIONS: Staff lacking VIEW_PAYMENTS cannot record counter settlement', async () => {
    const res = await request(app)
      .post(`/api/v1/sub-orders/${subOrderId}/counter-settlement`)
      .set('Authorization', `Bearer ${staffAToken}`)
      .send({ paymentMethod: 'CASH' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect(res.body.error.message).toContain('Missing required permission: VIEW_PAYMENTS');
  });

  // ==========================================
  // ADMIN ROUTE PROTECTION
  // ==========================================

  it('ADMIN PROTECTION: Student cannot access admin audit logs', async () => {
    const res = await request(app)
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${studentAToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('ADMIN PROTECTION: Stall Owner cannot access admin audit logs', async () => {
    const res = await request(app)
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${ownerAToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('ADMIN PROTECTION: Admin can access admin audit logs', async () => {
    const res = await request(app)
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
