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

describe('Liveness Lockout Policy & Consecutive Failure Threshold Integration API', () => {
  const app = createApp();
  const prisma = PrismaService.getClient();

  let studentId: string;
  let studentToken: string;
  let verificationId: string;
  const timestamp = Date.now();

  beforeAll(async () => {
    studentId = crypto.randomUUID();
    const profileId = crypto.randomUUID();
    verificationId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash('Password123!', 10);

    await prisma.user.create({
      data: {
        id: studentId,
        email: `student_lockout_${timestamp}@campus.edu`,
        phoneNumber: `+919922${timestamp.toString().slice(-6)}`,
        passwordHash,
        role: UserRole.STUDENT,
        isActive: true,
        studentProfile: {
          create: {
            id: profileId,
            fullName: 'Lockout Tester',
            universityRegNumber: `REG-LOCK-${timestamp}`,
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

    studentToken = TokenService.generateTokens({
      userId: studentId,
      role: UserRole.STUDENT,
      email: `student_lockout_${timestamp}@campus.edu`,
    }).accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('enforces 3-strike failure limit and triggers 24-hour lockout', async () => {
    // WebM buffer marked with SIMULATE_SPOOF
    const ebmlHeader = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

    // Strike 1
    const s1Res = await request(app)
      .post('/api/v1/students/verification/liveness/session')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(s1Res.status).toBe(201);
    const s1 = s1Res.body.data;

    const v1Res = await request(app)
      .post('/api/v1/students/verification/liveness/verify')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('sessionId', s1.sessionId)
      .field('sessionNonce', s1.sessionNonce)
      .attach('evidence', Buffer.concat([ebmlHeader, Buffer.from('SIMULATE_SPOOF_1')]), 'evidence1.webm');

    expect(v1Res.status).toBe(400);
    expect(v1Res.body.success).toBe(false);

    let lv = await prisma.livenessVerification.findUnique({ where: { verificationId } });
    expect(lv?.consecutiveFailures).toBe(1);
    expect(lv?.lockedUntil).toBeNull();

    // Strike 2
    const s2Res = await request(app)
      .post('/api/v1/students/verification/liveness/session')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(s2Res.status).toBe(201);
    const s2 = s2Res.body.data;

    const v2Res = await request(app)
      .post('/api/v1/students/verification/liveness/verify')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('sessionId', s2.sessionId)
      .field('sessionNonce', s2.sessionNonce)
      .attach('evidence', Buffer.concat([ebmlHeader, Buffer.from('SIMULATE_SPOOF_2')]), 'evidence2.webm');

    expect(v2Res.status).toBe(400);

    lv = await prisma.livenessVerification.findUnique({ where: { verificationId } });
    expect(lv?.consecutiveFailures).toBe(2);
    expect(lv?.lockedUntil).toBeNull();

    // Strike 3
    const s3Res = await request(app)
      .post('/api/v1/students/verification/liveness/session')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(s3Res.status).toBe(201);
    const s3 = s3Res.body.data;

    const v3Res = await request(app)
      .post('/api/v1/students/verification/liveness/verify')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('sessionId', s3.sessionId)
      .field('sessionNonce', s3.sessionNonce)
      .attach('evidence', Buffer.concat([ebmlHeader, Buffer.from('SIMULATE_SPOOF_3')]), 'evidence3.webm');

    expect(v3Res.status).toBe(400);

    lv = await prisma.livenessVerification.findUnique({ where: { verificationId } });
    expect(lv?.consecutiveFailures).toBe(3);
    expect(lv?.lockedUntil).not.toBeNull();
    expect(new Date(lv!.lockedUntil!).getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);

    // Strike 4: Next session request is blocked with 403 Forbidden due to active lockout
    const s4Res = await request(app)
      .post('/api/v1/students/verification/liveness/session')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(s4Res.status).toBe(403);
    expect(s4Res.body.success).toBe(false);
    expect(s4Res.body.error.message).toContain('locked due to repeated failures');
  });
});
