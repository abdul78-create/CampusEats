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

describe('Liveness Security, Replay Defense & BOLA Protection Integration API', () => {
  const app = createApp();
  const prisma = PrismaService.getClient();

  let studentAId: string;
  let studentAToken: string;
  let studentAVerificationId: string;

  let studentBId: string;
  let studentBToken: string;

  let suspendedStudentId: string;
  let suspendedStudentToken: string;

  const timestamp = Date.now();
  const ebmlHeader = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('Password123!', 10);

    // Student A
    studentAId = crypto.randomUUID();
    studentAVerificationId = crypto.randomUUID();
    await prisma.user.create({
      data: {
        id: studentAId,
        email: `alice_sec_${timestamp}@campus.edu`,
        phoneNumber: `+919924${timestamp.toString().slice(-6)}`,
        passwordHash,
        role: UserRole.STUDENT,
        isActive: true,
        studentProfile: {
          create: {
            fullName: 'Alice Security',
            universityRegNumber: `REG-SEC-A-${timestamp}`,
            accountStatus: StudentAccountStatus.PENDING_VERIFICATION,
            verifications: {
              create: {
                id: studentAVerificationId,
                status: VerificationStatus.UNDER_REVIEW,
                submittedAt: new Date(),
              },
            },
          },
        },
      },
    });
    studentAToken = TokenService.generateTokens({
      userId: studentAId,
      role: UserRole.STUDENT,
      email: `alice_sec_${timestamp}@campus.edu`,
    }).accessToken;

    // Student B
    studentBId = crypto.randomUUID();
    await prisma.user.create({
      data: {
        id: studentBId,
        email: `bob_sec_${timestamp}@campus.edu`,
        phoneNumber: `+919925${timestamp.toString().slice(-6)}`,
        passwordHash,
        role: UserRole.STUDENT,
        isActive: true,
        studentProfile: {
          create: {
            fullName: 'Bob Attacker',
            universityRegNumber: `REG-SEC-B-${timestamp}`,
            accountStatus: StudentAccountStatus.PENDING_VERIFICATION,
            verifications: {
              create: {
                status: VerificationStatus.UNDER_REVIEW,
                submittedAt: new Date(),
              },
            },
          },
        },
      },
    });
    studentBToken = TokenService.generateTokens({
      userId: studentBId,
      role: UserRole.STUDENT,
      email: `bob_sec_${timestamp}@campus.edu`,
    }).accessToken;

    // Suspended Student
    suspendedStudentId = crypto.randomUUID();
    await prisma.user.create({
      data: {
        id: suspendedStudentId,
        email: `charlie_susp_${timestamp}@campus.edu`,
        phoneNumber: `+919926${timestamp.toString().slice(-6)}`,
        passwordHash,
        role: UserRole.STUDENT,
        isActive: true,
        studentProfile: {
          create: {
            fullName: 'Charlie Suspended',
            universityRegNumber: `REG-SEC-C-${timestamp}`,
            accountStatus: StudentAccountStatus.SUSPENDED,
            verifications: {
              create: {
                status: VerificationStatus.SUSPENDED,
                submittedAt: new Date(),
              },
            },
          },
        },
      },
    });
    suspendedStudentToken = TokenService.generateTokens({
      userId: suspendedStudentId,
      role: UserRole.STUDENT,
      email: `charlie_susp_${timestamp}@campus.edu`,
    }).accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test('BOLA DEFENSE: Student B cannot submit evidence to verify Student A session', async () => {
    // Student A initiates session
    const sRes = await request(app)
      .post('/api/v1/students/verification/liveness/session')
      .set('Authorization', `Bearer ${studentAToken}`);
    expect(sRes.status).toBe(201);
    const { sessionId, sessionNonce } = sRes.body.data;

    // Student B attempts to hijack session submission
    const res = await request(app)
      .post('/api/v1/students/verification/liveness/verify')
      .set('Authorization', `Bearer ${studentBToken}`)
      .field('sessionId', sessionId)
      .field('sessionNonce', sessionNonce)
      .attach('evidence', Buffer.concat([ebmlHeader, Buffer.from('BOLA_ATTACK_STREAM')]), 'evidence.webm');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('belongs to another student');
  });

  test('NONCE INTEGRITY DEFENSE: Submitting mismatched or tampered nonce is rejected with 409 Conflict', async () => {
    const sRes = await request(app)
      .post('/api/v1/students/verification/liveness/session')
      .set('Authorization', `Bearer ${studentAToken}`);
    expect(sRes.status).toBe(201);
    const { sessionId } = sRes.body.data;

    const fakeNonce = crypto.randomBytes(32).toString('hex');
    const res = await request(app)
      .post('/api/v1/students/verification/liveness/verify')
      .set('Authorization', `Bearer ${studentAToken}`)
      .field('sessionId', sessionId)
      .field('sessionNonce', fakeNonce)
      .attach('evidence', Buffer.concat([ebmlHeader, Buffer.from('TAMPERED_NONCE_STREAM')]), 'evidence.webm');

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Invalid session nonce');
  });

  test('CLIENT GESTURE INJECTION REJECTION: Strictly rejects requests with client-asserted gestures or timestamps', async () => {
    const sRes = await request(app)
      .post('/api/v1/students/verification/liveness/session')
      .set('Authorization', `Bearer ${studentAToken}`);
    expect(sRes.status).toBe(201);
    const { sessionId, sessionNonce } = sRes.body.data;

    const res = await request(app)
      .post('/api/v1/students/verification/liveness/verify')
      .set('Authorization', `Bearer ${studentAToken}`)
      .field('sessionId', sessionId)
      .field('sessionNonce', sessionNonce)
      .field('naturalBlinkObserved', 'true') // Client asserting gesture
      .attach('evidence', Buffer.concat([ebmlHeader, Buffer.from('INJECTION_STREAM')]), 'evidence.webm');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Client-asserted gesture observations are strictly prohibited');
  });

  test('EXACT EVIDENCE BYTE-REPLAY DEFENSE: Reusing identical video bytes across sessions triggers 409 Conflict', async () => {
    // Session 1: Alice successfully verifies with genuine video
    const s1Res = await request(app)
      .post('/api/v1/students/verification/liveness/session')
      .set('Authorization', `Bearer ${studentAToken}`);
    expect(s1Res.status).toBe(201);
    const s1 = s1Res.body.data;

    const videoBytes = Buffer.concat([ebmlHeader, Buffer.from(`DEDUP_TEST_${timestamp}`)]);

    const v1Res = await request(app)
      .post('/api/v1/students/verification/liveness/verify')
      .set('Authorization', `Bearer ${studentAToken}`)
      .field('sessionId', s1.sessionId)
      .field('sessionNonce', s1.sessionNonce)
      .attach('evidence', videoBytes, 'video1.webm');

    expect(v1Res.status).toBe(200);
    expect(v1Res.body.data.isVerified).toBe(true);

    // Session 2: Alice creates a new session and attempts to submit the EXACT SAME video bytes
    const s2Res = await request(app)
      .post('/api/v1/students/verification/liveness/session')
      .set('Authorization', `Bearer ${studentAToken}`);
    expect(s2Res.status).toBe(201);
    const s2 = s2Res.body.data;

    const v2Res = await request(app)
      .post('/api/v1/students/verification/liveness/verify')
      .set('Authorization', `Bearer ${studentAToken}`)
      .field('sessionId', s2.sessionId)
      .field('sessionNonce', s2.sessionNonce)
      .attach('evidence', videoBytes, 'video2.webm'); // Replaying exact bytes!

    expect(v2Res.status).toBe(409);
    expect(v2Res.body.success).toBe(false);
    expect(v2Res.body.error.message).toContain('Evidence duplicate detected');
  });

  test('SUSPENDED STUDENT DEFENSE: Suspended student cannot create liveness sessions', async () => {
    const res = await request(app)
      .post('/api/v1/students/verification/liveness/session')
      .set('Authorization', `Bearer ${suspendedStudentToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Suspended student accounts');
  });
});
