import request from 'supertest';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/app.js';
import { PrismaService } from '../../src/shared/infrastructure/PrismaService.js';
import { TokenService } from '../../src/modules/identity/domain/TokenService.js';
import { UserRole, StudentAccountStatus, VerificationStatus } from '../../src/modules/identity/domain/IdentityEnums.js';

describe('Student Identity & Verification API (/api/v1/student)', () => {
  const app = createApp();
  const prisma = PrismaService.getClient();

  const timestamp = Date.now();
  let studentAToken: string;
  let studentAId: string;
  let studentAProfileId: string;

  let studentBToken: string;
  let studentBId: string;

  let ownerToken: string;
  let staffToken: string;

  let uploadedDocumentId: string;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('Password123!', 10);

    // 1. Seed Student A (Pending verification)
    studentAId = crypto.randomUUID();
    studentAProfileId = crypto.randomUUID();
    await prisma.user.create({
      data: {
        id: studentAId,
        email: `studentA_${timestamp}@campus.edu`,
        phoneNumber: `+919811${timestamp.toString().slice(-6)}`,
        passwordHash,
        role: UserRole.STUDENT,
        isActive: true,
        studentProfile: {
          create: {
            id: studentAProfileId,
            fullName: 'Student Alice',
            universityRegNumber: `REG-A-${timestamp}`,
            accountStatus: StudentAccountStatus.PENDING_VERIFICATION,
          },
        },
      },
    });

    // 2. Seed Student B (Separate tenant)
    studentBId = crypto.randomUUID();
    await prisma.user.create({
      data: {
        id: studentBId,
        email: `studentB_${timestamp}@campus.edu`,
        phoneNumber: `+919812${timestamp.toString().slice(-6)}`,
        passwordHash,
        role: UserRole.STUDENT,
        isActive: true,
        studentProfile: {
          create: {
            fullName: 'Student Bob',
            universityRegNumber: `REG-B-${timestamp}`,
            accountStatus: StudentAccountStatus.PENDING_VERIFICATION,
          },
        },
      },
    });

    // 3. Seed Stall Owner
    const ownerId = crypto.randomUUID();
    await prisma.user.create({
      data: {
        id: ownerId,
        email: `owner_${timestamp}@campus.edu`,
        phoneNumber: `+919813${timestamp.toString().slice(-6)}`,
        passwordHash,
        role: UserRole.STALL_OWNER,
        isActive: true,
      },
    });

    // 4. Seed Stall Staff
    const staffId = crypto.randomUUID();
    await prisma.user.create({
      data: {
        id: staffId,
        email: `staff_${timestamp}@campus.edu`,
        phoneNumber: `+919814${timestamp.toString().slice(-6)}`,
        passwordHash,
        role: UserRole.STALL_STAFF,
        isActive: true,
      },
    });

    // Generate JWT Bearer tokens directly
    studentAToken = TokenService.generateTokens({ userId: studentAId, role: UserRole.STUDENT, email: `studenta_${timestamp}@campus.edu` }).accessToken;
    studentBToken = TokenService.generateTokens({ userId: studentBId, role: UserRole.STUDENT, email: `studentb_${timestamp}@campus.edu` }).accessToken;
    ownerToken = TokenService.generateTokens({ userId: ownerId, role: UserRole.STALL_OWNER, email: `owner_${timestamp}@campus.edu` }).accessToken;
    staffToken = TokenService.generateTokens({ userId: staffId, role: UserRole.STALL_STAFF, email: `staff_${timestamp}@campus.edu` }).accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/v1/student/profile', () => {
    test('authenticated student retrieves own profile with verification status and ordering eligibility', async () => {
      const res = await request(app)
        .get('/api/v1/student/profile')
        .set('Authorization', `Bearer ${studentAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.fullName).toBe('Student Alice');
      expect(res.body.data.universityRegNumber).toBe(`REG-A-${timestamp}`);
      expect(res.body.data.email).toBe(`studentA_${timestamp}@campus.edu`);
      expect(res.body.data.accountStatus).toBe(StudentAccountStatus.PENDING_VERIFICATION);
      expect(res.body.data.isEligibleToOrder).toBe(false);

      // Verify zero sensitive credentials leaked
      expect(res.body.data.passwordHash).toBeUndefined();
      expect(res.body.data.password).toBeUndefined();
      expect(res.body.data.refreshTokens).toBeUndefined();
    });

    test('rejects unauthenticated profile request with 401', async () => {
      const res = await request(app).get('/api/v1/student/profile');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('rejects non-student roles (Stall Owner) with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/student/profile')
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/student/verification/status', () => {
    test('returns initial PENDING_SUBMISSION status before any upload', async () => {
      const res = await request(app)
        .get('/api/v1/student/verification/status')
        .set('Authorization', `Bearer ${studentAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(VerificationStatus.PENDING_SUBMISSION);
      expect(res.body.data.canSubmitDocument).toBe(true);
      expect(res.body.data.isEligibleToOrder).toBe(false);
    });
  });

  describe('POST /api/v1/student/verification/document', () => {
    test('rejects document upload without file with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/v1/student/verification/document')
        .set('Authorization', `Bearer ${studentAToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('strictly rejects JSON base64 upload path with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/v1/student/verification/document')
        .set('Authorization', `Bearer ${studentAToken}`)
        .set('Content-Type', 'application/json')
        .send({
          documentBase64: 'JVBERi0xLjQKJeLjz9MKMSAwIG9iajw8Pj5lbmRvYmoKdHJhaWxlcjw8Pj4KJSVFT0Y=',
          filename: 'test.pdf'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('multipart/form-data');
    });

    test('rejects disguised executable file (MZ header) with 400 Bad Request', async () => {
      const fakePdf = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00');
      const res = await request(app)
        .post('/api/v1/student/verification/document')
        .set('Authorization', `Bearer ${studentAToken}`)
        .attach('document', fakePdf, 'my_id.pdf');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('Executable binary files');
    });

    test('successfully uploads genuine PDF document, transitions state to UNDER_REVIEW, and creates notification & audit log', async () => {
      const genuinePdf = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');

      const res = await request(app)
        .post('/api/v1/student/verification/document')
        .set('Authorization', `Bearer ${studentAToken}`)
        .attach('document', genuinePdf, 'university_id_alice.pdf');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(VerificationStatus.UNDER_REVIEW);
      expect(res.body.data.document).toBeDefined();
      expect(res.body.data.document.fileMimeType).toBe('application/pdf');
      expect(res.body.data.document.originalFilename).toBe('university_id_alice.pdf');

      uploadedDocumentId = res.body.data.document.id;

      // Verify persistent notification was created for Student A
      const notif = await prisma.notification.findFirst({
        where: { userId: studentAId, type: 'VERIFICATION_UPDATE' },
      });
      expect(notif).not.toBeNull();
      expect(notif?.title).toBe('Identity Document Submitted');

      // Verify cryptographic audit log entry was created
      const audit = await prisma.auditLog.findFirst({
        where: { actorId: studentAId, actionType: 'STUDENT_DOCUMENT_SUBMITTED' },
      });
      expect(audit).not.toBeNull();
    });

    test('rejects Stall Owner from uploading student document with 403 Forbidden', async () => {
      const genuinePdf = Buffer.from('%PDF-1.4 test');
      const res = await request(app)
        .post('/api/v1/student/verification/document')
        .set('Authorization', `Bearer ${ownerToken}`)
        .attach('document', genuinePdf, 'owner_doc.pdf');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/student/verification/document/:id/url (IDOR & Access Barriers)', () => {
    test('Student A can obtain temporary signed download URL for their own document', async () => {
      const res = await request(app)
        .get(`/api/v1/student/verification/document/${uploadedDocumentId}/url`)
        .set('Authorization', `Bearer ${studentAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.url).toContain('/api/v1/storage/documents/download?');
      expect(res.body.data.expiresInSeconds).toBe(300);

      // Verify download endpoint serves file with valid token
      const downloadRes = await request(app).get(res.body.data.url);
      expect(downloadRes.status).toBe(200);
    });

    test('BOLA / IDOR DEFENSE: Student B strictly CANNOT access Student A document URL', async () => {
      const res = await request(app)
        .get(`/api/v1/student/verification/document/${uploadedDocumentId}/url`)
        .set('Authorization', `Bearer ${studentBToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain('You can only access your own identity document');
    });

    test('TENANT BARRIER: Stall Owner strictly CANNOT access student document URL', async () => {
      const res = await request(app)
        .get(`/api/v1/student/verification/document/${uploadedDocumentId}/url`)
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('STAFF BARRIER: Stall Staff strictly CANNOT access student document URL', async () => {
      const res = await request(app)
        .get(`/api/v1/student/verification/document/${uploadedDocumentId}/url`)
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});
