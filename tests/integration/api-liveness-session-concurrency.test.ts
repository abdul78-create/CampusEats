import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { createApp } from '../../src/app.js';
import { PrismaService } from '../../src/shared/infrastructure/PrismaService.js';
import { TokenService } from '../../src/modules/identity/domain/TokenService.js';
import { 
  UserRole, 
  StudentAccountStatus, 
  VerificationStatus,
  LivenessSessionStatus 
} from '../../src/modules/identity/domain/IdentityEnums.js';

describe('Liveness Session Creation & Concurrency Integration API', () => {
  const app = createApp();
  const prisma = PrismaService.getClient();

  let studentId: string;
  let studentToken: string;
  let verificationId: string;
  let adminId: string;
  let adminToken: string;
  const timestamp = Date.now();

  beforeAll(async () => {
    studentId = crypto.randomUUID();
    adminId = crypto.randomUUID();
    const profileId = crypto.randomUUID();
    verificationId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash('Password123!', 10);

    await prisma.user.create({
      data: {
        id: studentId,
        email: `student_session_${timestamp}@campus.edu`,
        phoneNumber: `+919921${timestamp.toString().slice(-6)}`,
        passwordHash,
        role: UserRole.STUDENT,
        isActive: true,
        studentProfile: {
          create: {
            id: profileId,
            fullName: 'Liveness Session Tester',
            universityRegNumber: `REG-SESS-${timestamp}`,
            accountStatus: StudentAccountStatus.PENDING_VERIFICATION,
            verifications: {
              create: {
                id: verificationId,
                status: VerificationStatus.UNDER_REVIEW,
                submittedAt: new Date(),
              },
            },
          },
        },
      },
    });

    // Seed a real admin user so requireAuth DB lookup succeeds
    await prisma.user.create({
      data: {
        id: adminId,
        email: `admin_session_${timestamp}@campus.edu`,
        phoneNumber: `+919920${timestamp.toString().slice(-6)}`,
        passwordHash,
        role: UserRole.ADMIN,
        isActive: true,
      },
    });

    studentToken = TokenService.generateTokens({
      userId: studentId,
      role: UserRole.STUDENT,
      email: `student_session_${timestamp}@campus.edu`,
    }).accessToken;

    adminToken = TokenService.generateTokens({
      userId: adminId,
      role: UserRole.ADMIN,
      email: `admin_session_${timestamp}@campus.edu`,
    }).accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/v1/students/verification/liveness/session', () => {
    test('creates new active liveness challenge session with randomized parameters and 300s TTL', async () => {
      const res = await request(app)
        .post('/api/v1/students/verification/liveness/session')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sessionId).toBeDefined();
      expect(res.body.data.sessionNonce).toMatch(/^[a-f0-9]{64}$/);
      expect(res.body.data.challengeSequence).toHaveLength(3);
      expect(res.body.data.challengeParams).toBeDefined();
      expect([1, 2]).toContain(res.body.data.challengeParams.blinkCount);
      expect([1.5, 2.5]).toContain(res.body.data.challengeParams.leftHoldSec);
      expect([1.5, 2.5]).toContain(res.body.data.challengeParams.rightHoldSec);
      expect(res.body.data.ttlSeconds).toBe(300);

      // Verify DB record
      const dbSession = await prisma.livenessSession.findUnique({
        where: { id: res.body.data.sessionId },
      });
      expect(dbSession).not.toBeNull();
      expect(dbSession?.status).toBe(LivenessSessionStatus.PENDING);
    });

    test('CONCURRENCY: Multiple rapid session requests serialize cleanly; exactly 1 active PENDING session exists', async () => {
      // Fire 4 session requests concurrently
      const responses = await Promise.all([
        request(app).post('/api/v1/students/verification/liveness/session').set('Authorization', `Bearer ${studentToken}`),
        request(app).post('/api/v1/students/verification/liveness/session').set('Authorization', `Bearer ${studentToken}`),
        request(app).post('/api/v1/students/verification/liveness/session').set('Authorization', `Bearer ${studentToken}`),
        request(app).post('/api/v1/students/verification/liveness/session').set('Authorization', `Bearer ${studentToken}`),
      ]);

      for (const res of responses) {
        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
      }

      // Check database: exactly 1 session should be PENDING, others EXPIRED
      const pendingSessions = await prisma.livenessSession.findMany({
        where: {
          verificationId,
          status: LivenessSessionStatus.PENDING,
        },
      });

      expect(pendingSessions).toHaveLength(1);
    });

    test('strictly rejects unauthenticated requests (401)', async () => {
      const res = await request(app).post('/api/v1/students/verification/liveness/session');
      expect(res.status).toBe(401);
    });

    test('rejects non-student role requests (403)', async () => {
      const res = await request(app)
        .post('/api/v1/students/verification/liveness/session')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(403);
    });
  });
});
