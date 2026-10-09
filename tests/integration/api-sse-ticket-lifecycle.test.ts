import request from 'supertest';
import crypto from 'node:crypto';
import { createApp } from '../../src/app.js';
import { PrismaService } from '../../src/shared/infrastructure/PrismaService.js';
import { TokenService } from '../../src/modules/identity/domain/TokenService.js';
import { UserRole } from '../../src/modules/identity/domain/IdentityEnums.js';
import { SseTicketStore } from '../../src/modules/realtime/infrastructure/SseTicketStore.js';

describe('Phase 6 — SSE Authentication Ticket Lifecycle API', () => {
  const app = createApp();
  const prisma = PrismaService.getClient();

  const ts = Date.now().toString(36);
  const studentId = crypto.randomUUID();
  let studentToken: string;

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: studentId,
        email: `student_ticket_${ts}@campus.edu`,
        phoneNumber: `+9196${Math.floor(10000000 + Math.random() * 90000000)}`,
        passwordHash: '$2b$12$secureMockHash',
        role: UserRole.STUDENT,
      },
    });

    const tokens = TokenService.generateTokens({
      userId: studentId,
      role: UserRole.STUDENT,
      email: `student_ticket_${ts}@campus.edu`,
    });
    studentToken = tokens.accessToken;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: studentId } });
    await prisma.$disconnect();
  });

  it('rejects unauthenticated ticket issuance with 401', async () => {
    const res = await request(app).post('/api/v1/events/ticket');
    expect(res.status).toBe(401);
  });

  it('issues a single-use 30-second ticket for authenticated student', async () => {
    const res = await request(app)
      .post('/api/v1/events/ticket')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.ticket).toBeDefined();
    expect(res.body.data.ticket).toMatch(/^sse_tkt_[0-9a-f]{64}$/);
    expect(res.body.data.expiresInSeconds).toBe(30);
  });

  it('rejects connection without ticket or token with 401', async () => {
    const res = await request(app).get('/api/v1/events/stream');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects invalid or tampered ticket with 401', async () => {
    const res = await request(app).get('/api/v1/events/stream?ticket=sse_tkt_invalid_hex_or_tampered');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('SseTicketStore: single-use atomic consumption prevents ticket reuse', () => {
    const store = new SseTicketStore(30);
    const { ticket } = store.issueTicket({
      userId: studentId,
      role: UserRole.STUDENT,
      authorizedChannels: [`user:${studentId}`],
    });

    // 1st consumption: success
    const firstConsumption = store.consumeTicket(ticket);
    expect(firstConsumption).not.toBeNull();
    expect(firstConsumption?.userId).toBe(studentId);

    // 2nd consumption (replay attack): rejected
    const replayConsumption = store.consumeTicket(ticket);
    expect(replayConsumption).toBeNull();
  });

  it('SseTicketStore: rejects expired tickets after TTL window', () => {
    // 0.01 sec TTL (10ms)
    const shortLivedStore = new SseTicketStore(0.01);
    const { ticket } = shortLivedStore.issueTicket({
      userId: studentId,
      role: UserRole.STUDENT,
      authorizedChannels: [`user:${studentId}`],
    });

    return new Promise<void>(resolve => {
      setTimeout(() => {
        const consumed = shortLivedStore.consumeTicket(ticket);
        expect(consumed).toBeNull();
        resolve();
      }, 50);
    });
  });

  it('SseTicketStore: stores hashed tickets in memory rather than raw plaintext tokens', () => {
    const store = new SseTicketStore(30);
    const { ticket } = store.issueTicket({
      userId: studentId,
      role: UserRole.STUDENT,
      authorizedChannels: [`user:${studentId}`],
    });

    const expectedHash = crypto.createHash('sha256').update(ticket).digest('hex');
    expect((store as any).tickets.has(expectedHash)).toBe(true);
    expect((store as any).tickets.has(ticket)).toBe(false);
  });
});
