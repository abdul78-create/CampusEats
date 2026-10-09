import request from 'supertest';
import { createApp } from '../../src/app.js';
import { PrismaService } from '../../src/shared/infrastructure/PrismaService.js';
import { TokenService } from '../../src/modules/identity/domain/TokenService.js';
import { UserRole } from '../../src/modules/identity/domain/IdentityEnums.js';
import { AuditActionType } from '../../src/modules/audit/domain/AuditEnums.js';

describe('API Authentication & Session Architecture (/api/v1/auth)', () => {
  const app = createApp();
  const prisma = PrismaService.getClient();

  const timestamp = Date.now().toString(36);
  const studentEmail = `student_${timestamp}@campus.edu`;
  const studentPhone = `+9198${Math.floor(10000000 + Math.random() * 90000000)}`;
  const studentPassword = 'SecureCampusPassword123!';
  const regNumber = `REG-${timestamp.toUpperCase()}`;

  let studentUserId: string;
  let accessToken: string;
  let refreshToken: string;

  // Track created entities for clean teardown
  const createdUserIds: string[] = [];
  const createdStallIds: string[] = [];
  const createdOrderIds: string[] = [];

  afterAll(async () => {
    // Clean up created orders, stalls, and users in correct dependency order
    if (createdOrderIds.length > 0) {
      await prisma.subOrder.deleteMany({ where: { masterOrderId: { in: createdOrderIds } } });
      await prisma.masterOrder.deleteMany({ where: { id: { in: createdOrderIds } } });
    }
    if (createdStallIds.length > 0) {
      await prisma.staffAccount.deleteMany({ where: { stallId: { in: createdStallIds } } });
      await prisma.menuItem.deleteMany({ where: { stallId: { in: createdStallIds } } });
      await prisma.stall.deleteMany({ where: { id: { in: createdStallIds } } });
    }
    const allUserIds = [...new Set([...createdUserIds, ...(studentUserId ? [studentUserId] : [])])];
    if (allUserIds.length > 0) {
      await prisma.refreshSession.deleteMany({ where: { userId: { in: allUserIds } } });
      await prisma.staffPermission.deleteMany({});
      await prisma.staffAccount.deleteMany({ where: { userId: { in: allUserIds } } });
      await prisma.studentProfile.deleteMany({ where: { userId: { in: allUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: allUserIds } } });
    }
    await prisma.user.deleteMany({ where: { email: studentEmail } });
  });

  // =========================================================================
  // 1. REGISTRATION & INPUT VALIDATION
  // =========================================================================

  it('POST /api/v1/auth/register - successfully registers a new student with pending verification', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: studentEmail,
        password: studentPassword,
        fullName: 'Aarav Sharma',
        phoneNumber: studentPhone,
        universityRegNumber: regNumber,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toBeDefined();
    expect(res.body.data.user.email).toBe(studentEmail);
    expect(res.body.data.user.role).toBe('STUDENT');
    expect(res.body.data.user.studentProfile.accountStatus).toBe('PENDING_VERIFICATION');

    studentUserId = res.body.data.user.id;
    createdUserIds.push(studentUserId);

    // STRICT SECURITY RULE: Password hash must NEVER be returned in API responses
    expect((res.body.data.user as any).passwordHash).toBeUndefined();
    expect((res.body.data.user as any).password).toBeUndefined();
  });

  it('POST /api/v1/auth/register - rejects duplicate email with 409 Conflict', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: studentEmail,
        password: studentPassword,
        fullName: 'Duplicate User',
        phoneNumber: `+9199${Math.floor(10000000 + Math.random() * 90000000)}`,
        universityRegNumber: `REG-DUP-${Date.now()}`,
      });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('POST /api/v1/auth/register - rejects weak password (< 8 chars) with 400 Validation Error', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: `weak_${Date.now()}@campus.edu`,
        password: 'short',
        fullName: 'Weak Password User',
        phoneNumber: `+9197${Math.floor(10000000 + Math.random() * 90000000)}`,
        universityRegNumber: `REG-WEAK-${Date.now()}`,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  // =========================================================================
  // 2. AUTHENTICATION & LOGIN
  // =========================================================================

  it('POST /api/v1/auth/login - successfully authenticates and issues HMAC-signed access & refresh tokens', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: studentEmail,
        password: studentPassword,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens.accessToken).toBeDefined();
    expect(res.body.data.tokens.refreshToken).toBeDefined();
    expect(res.body.data.tokens.tokenType).toBe('Bearer');
    expect(res.body.data.user.email).toBe(studentEmail);
    expect((res.body.data.user as any).passwordHash).toBeUndefined();

    accessToken = res.body.data.tokens.accessToken;
    refreshToken = res.body.data.tokens.refreshToken;
  });

  it('POST /api/v1/auth/login - anti-enumeration: non-existent email returns generic 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: `nonexistent_${Date.now()}@campus.edu`,
        password: studentPassword,
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toBe('Invalid credentials');
  });

  it('POST /api/v1/auth/login - anti-enumeration: incorrect password returns identical generic 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: studentEmail,
        password: 'IncorrectPassword999!',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
    expect(res.body.error.message).toBe('Invalid credentials');
  });

  it('GET /api/v1/auth/me - retrieves authenticated student profile with valid Bearer token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(studentEmail);
    expect(res.body.data.role).toBe('STUDENT');
    expect((res.body.data as any).passwordHash).toBeUndefined();
  });

  it('GET /api/v1/auth/me - rejects unauthenticated request with 401 Unauthorized', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  // =========================================================================
  // 3. PHASE 2.1 AUTHENTICATION & REFRESH-SESSION LIFECYCLE TESTS
  // =========================================================================

  it('1. login creates refresh session with hashed token in DB', async () => {
    const session = await prisma.refreshSession.findFirst({
      where: { userId: studentUserId },
      orderBy: { createdAt: 'desc' },
    });

    expect(session).toBeDefined();
    expect(session?.tokenHash).toBeDefined();
    expect(session?.tokenHash.length).toBe(64); // SHA-256 hex string length
    expect(session?.familyId).toBeDefined();
    expect(session?.revokedAt).toBeNull();
    expect(new Date(session!.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('2. plaintext refresh token is never persisted in PostgreSQL', async () => {
    const session = await prisma.refreshSession.findFirst({
      where: { userId: studentUserId },
      orderBy: { createdAt: 'desc' },
    });

    // 1. The stored hash must not equal the raw plaintext token
    expect(session?.tokenHash).not.toBe(refreshToken);
    // 2. The stored hash must equal the deterministic SHA-256 fingerprint
    expect(session?.tokenHash).toBe(TokenService.hashToken(refreshToken));

    // 3. Verifying direct search for the plaintext token in database returns null
    const leakCheck = await prisma.refreshSession.findFirst({
      where: { tokenHash: refreshToken },
    });
    expect(leakCheck).toBeNull();
  });

  let rotatedAccessToken: string;
  let rotatedRefreshToken: string;

  it('3. refresh token works and issues new token pair', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.tokens.accessToken).toBeDefined();
    expect(res.body.data.tokens.refreshToken).toBeDefined();
    expect(res.body.data.tokens.refreshToken).not.toBe(refreshToken); // Must be a new token
    expect(res.body.data.user.email).toBe(studentEmail);

    rotatedAccessToken = res.body.data.tokens.accessToken;
    rotatedRefreshToken = res.body.data.tokens.refreshToken;
  });

  it('4. refresh token rotation works and links replaced session', async () => {
    const oldHash = TokenService.hashToken(refreshToken);
    const newHash = TokenService.hashToken(rotatedRefreshToken);

    const oldSession = await prisma.refreshSession.findUnique({
      where: { tokenHash: oldHash },
    });
    const newSession = await prisma.refreshSession.findUnique({
      where: { tokenHash: newHash },
    });

    expect(oldSession).toBeDefined();
    expect(newSession).toBeDefined();
    // Old session must be revoked
    expect(oldSession?.revokedAt).not.toBeNull();
    // Old session links to new session
    expect(oldSession?.replacedBySessionId).toBe(newSession?.id);
    // New session belongs to the same token family
    expect(newSession?.familyId).toBe(oldSession?.familyId);
    expect(newSession?.revokedAt).toBeNull();
  });

  it('5. old refresh token fails after rotation', async () => {
    // Presenting the previous, already-rotated refresh token
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('6. refresh-token replay is detected, revokes session family, and logs security audit', async () => {
    const newHash = TokenService.hashToken(rotatedRefreshToken);

    // The replay was attempted in the test above when presenting old refreshToken
    // Check that the new session in the same family has now also been revoked!
    const newSession = await prisma.refreshSession.findUnique({
      where: { tokenHash: newHash },
    });
    expect(newSession?.revokedAt).not.toBeNull();

    // Check that the security audit event was persisted
    const replayAudit = await prisma.auditLog.findFirst({
      where: {
        actionType: AuditActionType.AUTH_REPLAY_DETECTED,
        actorId: studentUserId,
      },
      orderBy: { timestamp: 'desc' },
    });
    expect(replayAudit).toBeDefined();
    expect(replayAudit?.actionType).toBe('AUTH_REPLAY_DETECTED');

    // Subsequent refresh attempt with the rotated token must now ALSO fail
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotatedRefreshToken });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  let freshRefreshToken: string;
  let freshAccessToken: string;

  it('7. logout revokes refresh session server-side', async () => {
    // 1. Fresh login to obtain active tokens
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: studentEmail, password: studentPassword });

    expect(loginRes.status).toBe(200);
    freshRefreshToken = loginRes.body.data.tokens.refreshToken;
    freshAccessToken = loginRes.body.data.tokens.accessToken;

    // 2. Perform server-side logout
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${freshAccessToken}`)
      .send({ refreshToken: freshRefreshToken });

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    // 3. Verify in PostgreSQL that the session was revoked
    const session = await prisma.refreshSession.findUnique({
      where: { tokenHash: TokenService.hashToken(freshRefreshToken) },
    });
    expect(session).toBeDefined();
    expect(session?.revokedAt).not.toBeNull();
  });

  it('8. revoked refresh token fails after logout', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: freshRefreshToken });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('9. expired refresh token fails', async () => {
    // Create an expired session in PostgreSQL
    const expiredToken = TokenService.generateTokens({
      userId: studentUserId,
      role: UserRole.STUDENT,
      email: studentEmail,
    }).refreshToken;

    await prisma.refreshSession.create({
      data: {
        userId: studentUserId,
        tokenHash: TokenService.hashToken(expiredToken),
        familyId: 'expired-family-test',
        expiresAt: new Date(Date.now() - 10000), // 10 seconds in the past
      },
    });

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: expiredToken });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('10. revoked or deleted user cannot refresh tokens', async () => {
    // 1. Create a user and deactivate them (isActive = false)
    const deactivatedUser = await prisma.user.create({
      data: {
        email: `deactivated_${Date.now()}@campus.edu`,
        passwordHash: 'dummy_hash',
        role: 'STUDENT',
        phoneNumber: `+9196${Math.floor(10000000 + Math.random() * 90000000)}`,
        isActive: false,
      },
    });
    createdUserIds.push(deactivatedUser.id);

    const deactTokens = TokenService.generateTokens({
      userId: deactivatedUser.id,
      role: UserRole.STUDENT,
      email: deactivatedUser.email,
    });

    await prisma.refreshSession.create({
      data: {
        userId: deactivatedUser.id,
        tokenHash: TokenService.hashToken(deactTokens.refreshToken),
        familyId: `family-${deactivatedUser.id}`,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const res1 = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: deactTokens.refreshToken });

    expect(res1.status).toBe(401);
    expect(res1.body.success).toBe(false);
    expect(res1.body.error.code).toBe('UNAUTHORIZED');

    // 2. Soft-deleted user (deletedAt is set)
    const softDeletedUser = await prisma.user.create({
      data: {
        email: `deleted_${Date.now()}@campus.edu`,
        passwordHash: 'dummy_hash',
        role: 'STUDENT',
        phoneNumber: `+9195${Math.floor(10000000 + Math.random() * 90000000)}`,
        isActive: true,
        deletedAt: new Date(),
      },
    });
    createdUserIds.push(softDeletedUser.id);

    const deletedTokens = TokenService.generateTokens({
      userId: softDeletedUser.id,
      role: UserRole.STUDENT,
      email: softDeletedUser.email,
    });

    await prisma.refreshSession.create({
      data: {
        userId: softDeletedUser.id,
        tokenHash: TokenService.hashToken(deletedTokens.refreshToken),
        familyId: `family-${softDeletedUser.id}`,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const res2 = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: deletedTokens.refreshToken });

    expect(res2.status).toBe(401);
    expect(res2.body.success).toBe(false);
    expect(res2.body.error.code).toBe('UNAUTHORIZED');
  });

  it('11. database role change immediately overrides stale JWT role claim', async () => {
    // 1. Create a STALL_OWNER in PostgreSQL
    const ownerUser = await prisma.user.create({
      data: {
        email: `owner_test_${Date.now()}@campus.edu`,
        passwordHash: 'dummy_hash',
        role: 'STALL_OWNER',
        phoneNumber: `+9194${Math.floor(10000000 + Math.random() * 90000000)}`,
        isActive: true,
      },
    });
    createdUserIds.push(ownerUser.id);

    // Create a stall owned by this user
    const stall = await prisma.stall.create({
      data: {
        name: `Owner Test Stall ${Date.now()}`,
        ownerId: ownerUser.id,
        campusBlock: 'Block A',
        liveStatus: 'OPEN',
      },
    });
    createdStallIds.push(stall.id);

    // 2. Issue an access token containing role claim: 'STALL_OWNER'
    const ownerTokens = TokenService.generateTokens({
      userId: ownerUser.id,
      role: UserRole.STALL_OWNER,
      email: ownerUser.email,
    });

    // 3. Verify owner access works initially
    const resInit = await request(app)
      .get('/api/v1/owner/stall')
      .set('Authorization', `Bearer ${ownerTokens.accessToken}`);

    expect(resInit.status).toBe(200);
    expect(resInit.body.data.id).toBe(stall.id);

    // 4. Admin changes user role to STUDENT in PostgreSQL database
    await prisma.user.update({
      where: { id: ownerUser.id },
      data: { role: 'STUDENT' },
    });

    // 5. Present the EXACT SAME unexpired access token (which still contains role: STALL_OWNER)
    const resDemoted = await request(app)
      .get('/api/v1/owner/stall')
      .set('Authorization', `Bearer ${ownerTokens.accessToken}`);

    // Must be rejected with 403 Forbidden because database role is authoritative!
    expect(resDemoted.status).toBe(403);
    expect(resDemoted.body.success).toBe(false);
    expect(resDemoted.body.error.code).toBe('FORBIDDEN');
    expect(resDemoted.body.error.message).toContain('Access denied');
  });

  it('12. removed staff permission in database immediately overrides stale access token', async () => {
    // 1. Create stall owner and staff user
    const stallOwner = await prisma.user.create({
      data: {
        email: `owner_perm_${Date.now()}@campus.edu`,
        passwordHash: 'dummy_hash',
        role: 'STALL_OWNER',
        phoneNumber: `+9193${Math.floor(10000000 + Math.random() * 90000000)}`,
      },
    });
    createdUserIds.push(stallOwner.id);

    const stall = await prisma.stall.create({
      data: {
        name: `Perm Test Stall ${Date.now()}`,
        ownerId: stallOwner.id,
        campusBlock: 'Block A',
        liveStatus: 'OPEN',
      },
    });
    createdStallIds.push(stall.id);

    const staffUser = await prisma.user.create({
      data: {
        email: `staff_perm_${Date.now()}@campus.edu`,
        passwordHash: 'dummy_hash',
        role: 'STALL_STAFF',
        phoneNumber: `+9192${Math.floor(10000000 + Math.random() * 90000000)}`,
      },
    });
    createdUserIds.push(staffUser.id);

    const staffAccount = await prisma.staffAccount.create({
      data: {
        userId: staffUser.id,
        stallId: stall.id,
        permissions: {
          create: [{ permission: 'MANAGE_ORDERS' }],
        },
      },
    });

    // Create dedicated student user for the test order
    const studentUser = await prisma.user.create({
      data: {
        email: `student_test_${Date.now()}@campus.edu`,
        passwordHash: 'dummy_hash',
        role: 'STUDENT',
        phoneNumber: `+9191${Math.floor(10000000 + Math.random() * 90000000)}`,
        studentProfile: {
          create: {
            fullName: 'Test Student',
            universityRegNumber: `REG-${Date.now()}`,
            accountStatus: 'ACTIVE',
          },
        },
      },
    });
    createdUserIds.push(studentUser.id);

    // Create an order & sub-order ready for pickup
    const order = await prisma.masterOrder.create({
      data: {
        studentId: studentUser.id,
        orderNumber: `ORD-TEST-${Date.now()}`,
        status: 'PAYMENT_CONFIRMED',
        totalAmount: 30.00,
        advancePercentage: 100,
        advanceAmount: 30.00,
        remainingAmount: 0.00,
        amountPaid: 30.00,
      },
    });
    createdOrderIds.push(order.id);

    const subOrder1 = await prisma.subOrder.create({
      data: {
        masterOrderId: order.id,
        stallId: stall.id,
        subOrderNumber: `SUB-1-${Date.now()}`,
        subtotalAmount: 30.00,
        advancePaidAmount: 30.00,
        balanceDueAmount: 0.00,
        isBalancePaid: true,
        status: 'READY',
        items: {
          create: [{
            snapshotItemName: 'Masala Chai',
            snapshotPrice: 30.00,
            snapshotPrepMinutes: 5,
            quantity: 1,
            totalPrice: 30.00,
          }],
        },
      },
    });

    const staffTokens = TokenService.generateTokens({
      userId: staffUser.id,
      role: UserRole.STALL_STAFF,
      email: staffUser.email,
    });

    // Initial collect succeeds with valid permission
    const resInit = await request(app)
      .post(`/api/v1/sub-orders/${subOrder1.id}/collect`)
      .set('Authorization', `Bearer ${staffTokens.accessToken}`);

    expect(resInit.status).toBe(200);
    expect(resInit.body.success).toBe(true);

    // 2. Remove MANAGE_ORDERS permission from database
    await prisma.staffPermission.deleteMany({
      where: { staffAccountId: staffAccount.id },
    });

    // Create second sub-order ready for pickup
    const subOrder2 = await prisma.subOrder.create({
      data: {
        masterOrderId: order.id,
        stallId: stall.id,
        subOrderNumber: `SUB-2-${Date.now()}`,
        subtotalAmount: 30.00,
        advancePaidAmount: 30.00,
        balanceDueAmount: 0.00,
        isBalancePaid: true,
        status: 'READY',
        items: {
          create: [{
            snapshotItemName: 'Masala Chai',
            snapshotPrice: 30.00,
            snapshotPrepMinutes: 5,
            quantity: 1,
            totalPrice: 30.00,
          }],
        },
      },
    });

    // 3. Staff attempts to collect second sub-order with the exact same access token
    const resDenied = await request(app)
      .post(`/api/v1/sub-orders/${subOrder2.id}/collect`)
      .set('Authorization', `Bearer ${staffTokens.accessToken}`);

    expect(resDenied.status).toBe(403);
    expect(resDenied.body.success).toBe(false);
    expect(resDenied.body.error.code).toBe('FORBIDDEN');
    expect(resDenied.body.error.message).toContain('Missing required permission: MANAGE_ORDERS');
  });
});
