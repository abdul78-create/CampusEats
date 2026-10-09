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

describe('Admin Liveness Inspection & Forensic Audit Integration API', () => {
  const app = createApp();
  const prisma = PrismaService.getClient();

  let adminId: string;
  let adminToken: string;

  let studentId: string;
  let studentToken: string;
  let verificationId: string;

  const timestamp = Date.now();
  const ebmlHeader = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('Password123!', 10);

    // Admin
    adminId = crypto.randomUUID();
    await prisma.user.create({
      data: {
        id: adminId,
        email: `admin_audit_${timestamp}@campus.edu`,
        phoneNumber: `+919927${timestamp.toString().slice(-6)}`,
        passwordHash,
        role: UserRole.ADMIN,
        isActive: true,
      },
    });
    adminToken = TokenService.generateTokens({
      userId: adminId,
      role: UserRole.ADMIN,
      email: `admin_audit_${timestamp}@campus.edu`,
    }).accessToken;

    // Student
    studentId = crypto.randomUUID();
    verificationId = crypto.randomUUID();
    await prisma.user.create({
      data: {
        id: studentId,
        email: `student_audit_${timestamp}@campus.edu`,
        phoneNumber: `+919928${timestamp.toString().slice(-6)}`,
        passwordHash,
        role: UserRole.STUDENT,
        isActive: true,
        studentProfile: {
          create: {
            fullName: 'Audit Student',
            universityRegNumber: `REG-AUDIT-${timestamp}`,
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
      email: `student_audit_${timestamp}@campus.edu`,
    }).accessToken;

    // Student completes liveness
    const sRes = await request(app)
      .post('/api/v1/students/verification/liveness/session')
      .set('Authorization', `Bearer ${studentToken}`);
    const { sessionId, sessionNonce } = sRes.body.data;

    await request(app)
      .post('/api/v1/students/verification/liveness/verify')
      .set('Authorization', `Bearer ${studentToken}`)
      .field('sessionId', sessionId)
      .field('sessionNonce', sessionNonce)
      .attach('evidence', Buffer.concat([ebmlHeader, Buffer.from(`AUDIT_VIDEO_${timestamp}`)]), 'evidence.webm');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/v1/admin/verifications/:id/liveness', () => {
    test('admin inspects liveness record and receives signed video URL and session history', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/verifications/${verificationId}/liveness`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.verificationId).toBe(verificationId);
      expect(res.body.data.isLiveHuman).toBe(true);
      expect(res.body.data.confidenceScore).toBeGreaterThanOrEqual(0.80);
      expect(res.body.data.signedEvidenceUrl).toBeDefined();
      expect(res.body.data.signedEvidenceUrl).toContain('/api/v1/storage/documents/download?path=');
      expect(res.body.data.recentSessions).toBeInstanceOf(Array);
      expect(res.body.data.recentSessions.length).toBeGreaterThanOrEqual(1);

      // Verify audit log creation for biometric liveness evidence access
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          actorId: adminId,
          actionType: 'LIVENESS_EVIDENCE_ACCESSED' as any,
          targetEntity: 'LivenessVerification',
        },
      });
      expect(auditLog).not.toBeNull();
    });

    test('students are strictly forbidden from accessing admin liveness endpoint (403)', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/verifications/${verificationId}/liveness`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    test('unauthenticated requests are rejected (401)', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/verifications/${verificationId}/liveness`);

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/students/verification/liveness/status', () => {
    test('student can retrieve their own liveness status without exposing raw storage path or nonces', async () => {
      const res = await request(app)
        .get('/api/v1/students/verification/liveness/status')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isLiveHuman).toBe(true);
      expect(res.body.data.consecutiveFailures).toBe(0);
      expect(res.body.data.isLocked).toBe(false);
      expect(res.body.data.rawStoragePath).toBeUndefined();
    });
  });
});
