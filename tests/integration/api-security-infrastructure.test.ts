import request from 'supertest';
import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { createApp } from '../../src/app.js';
import { correlationIdMiddleware } from '../../src/shared/middleware/correlationId.middleware.js';
import { errorHandlerMiddleware } from '../../src/shared/middleware/errorHandler.middleware.js';

describe('Security, Observability & Infrastructure API Tests', () => {
  const app = createApp();

  // ==========================================
  // HEALTH & READINESS CHECKS
  // ==========================================

  it('GET /health - confirms process liveness without leaking internals', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect((res.body as any).databaseUrl).toBeUndefined();
    expect((res.body as any).env).toBeUndefined();
    expect((res.body as any).secret).toBeUndefined();
  });

  it('GET /ready - verifies PostgreSQL connectivity without leaking credentials', async () => {
    const res = await request(app).get('/ready');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.postgres).toBe('connected');

    // STRICT RULE: No connection strings, passwords, or hostnames in readiness payload
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toContain('postgresql://');
    expect(bodyStr).not.toContain('password');
    expect(bodyStr).not.toContain('campuseats_user');
  });

  // ==========================================
  // CORRELATION & REQUEST IDENTIFIERS
  // ==========================================

  it('CORRELATION ID: accepts and preserves incoming client X-Request-ID header', async () => {
    const customRequestId = 'client-trace-id-abc-123';
    const res = await request(app)
      .get('/health')
      .set('X-Request-ID', customRequestId);

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBe(customRequestId);
  });

  it('CORRELATION ID: generates secure server-side request ID when none provided', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).toMatch(/^req_[a-f0-9-]+$/);
  });

  // ==========================================
  // SECURITY HEADERS & CORS
  // ==========================================

  it('SECURITY HEADERS: Helmet applies protective HTTP headers', async () => {
    const res = await request(app).get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('CORS POLICY: rejects requests from unauthorized origins', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://malicious-attacker-site.com');

    // CORS policy blocks disallowed origins
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('CORS_FORBIDDEN');
  });

  it('CORS POLICY: permits requests from authorized frontend origins', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'http://localhost:3000');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  });

  // ==========================================
  // INPUT VALIDATION & ERROR SANITIZATION
  // ==========================================

  it('INPUT VALIDATION: rejects invalid UUID path parameters with 400 and structured details', async () => {
    const res = await request(app)
      .get('/api/v1/stalls/not-a-valid-uuid/menu');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.requestId).toBeDefined();
  });

  it('ERROR ENVELOPE: internal server errors never leak stack traces or internals', async () => {
    // Construct isolated test app to induce simulated internal error
    const testApp = express();
    testApp.use(correlationIdMiddleware);
    testApp.get('/test-error', () => {
      throw new Error('Simulated internal database crash or secret failure: prisma://secret_conn_string');
    });
    testApp.use(errorHandlerMiddleware);

    const res = await request(testApp).get('/test-error');

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(res.body.error.message).toBe('An unexpected internal error occurred.');
    expect(res.body.error.requestId).toBeDefined();

    // Critical: stack traces must NEVER be exposed
    expect((res.body as any).stack).toBeUndefined();
    expect((res.body.error as any).stack).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('prisma://secret_conn_string');
  });

  // ==========================================
  // RATE LIMITING
  // ==========================================

  it('RATE LIMITING: blocks rapid excessive requests with 429 RATE_LIMIT_EXCEEDED', async () => {
    const rateLimitedApp = express();
    rateLimitedApp.use(correlationIdMiddleware);

    const strictLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 2, // strictly 2 requests allowed
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req: Request, res: Response) => {
        res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please throttle.',
            requestId: req.id,
          },
        });
      },
    });

    rateLimitedApp.get('/test-limit', strictLimiter, (_req, res) => {
      res.status(200).json({ status: 'ok' });
    });

    // 1st request - ok
    const res1 = await request(rateLimitedApp).get('/test-limit');
    expect(res1.status).toBe(200);

    // 2nd request - ok
    const res2 = await request(rateLimitedApp).get('/test-limit');
    expect(res2.status).toBe(200);

    // 3rd request - blocked by rate limiter
    const res3 = await request(rateLimitedApp).get('/test-limit');
    expect(res3.status).toBe(429);
    expect(res3.body.success).toBe(false);
    expect(res3.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(res3.body.error.requestId).toBeDefined();
  });

  // ==========================================
  // OPENAPI SPECIFICATION
  // ==========================================

  it('OPENAPI: GET /api/v1/spec delivers OpenAPI 3.0 documentation without secrets', async () => {
    const res = await request(app).get('/api/v1/spec');

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
    expect(res.body.info.title).toBe('CampusEats REST API');
    expect(res.body.paths['/auth/login']).toBeDefined();
    expect(res.body.paths['/orders/checkout']).toBeDefined();

    // STRICT RULE: No real secrets or credentials in OpenAPI spec examples
    const specStr = JSON.stringify(res.body);
    expect(specStr).not.toContain('campuseats_password');
    expect(specStr).not.toContain('postgresql://');
  });
});
