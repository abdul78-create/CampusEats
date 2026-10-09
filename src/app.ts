import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { z } from 'zod';

import { PrismaService } from './shared/infrastructure/PrismaService.js';
import { PrismaStallRepository } from './modules/stall/infrastructure/PrismaStallRepository.js';
import { PrismaOrderRepository } from './modules/ordering/infrastructure/PrismaOrderRepository.js';
import { PrismaInventoryRepository } from './modules/stall/infrastructure/PrismaInventoryRepository.js';
import { PrismaAuditLogRepository } from './modules/audit/infrastructure/PrismaAuditLogRepository.js';
import { PrismaIdempotencyRepository } from './shared/infrastructure/PrismaIdempotencyRepository.js';

import { AuthService } from './modules/identity/application/AuthService.js';
import { CheckoutService } from './modules/ordering/application/CheckoutService.js';
import { SubOrderManagementService } from './modules/ordering/application/SubOrderManagementService.js';

import { AuthController } from './modules/identity/presentation/AuthController.js';
import { StallController } from './modules/stall/presentation/StallController.js';
import { OwnerStallController } from './modules/stall/presentation/OwnerStallController.js';
import { OrderController } from './modules/ordering/presentation/OrderController.js';
import { SubOrderController } from './modules/ordering/presentation/SubOrderController.js';
import { AdminController } from './modules/identity/presentation/AdminController.js';
import { PrismaStudentVerificationRepository } from './modules/identity/infrastructure/PrismaStudentVerificationRepository.js';
import { LocalStorageProvider } from './modules/identity/domain/StorageProvider.js';
import { StudentVerificationService } from './modules/identity/application/StudentVerificationService.js';
import { StudentVerificationController } from './modules/identity/presentation/StudentVerificationController.js';
import { AdminVerificationController } from './modules/identity/presentation/AdminVerificationController.js';
import { documentUploadMiddleware, livenessEvidenceUploadMiddleware } from './modules/identity/presentation/upload.middleware.js';
import { validateLivenessProviderConfig, MockLivenessVerificationProvider } from './modules/identity/domain/LivenessVerificationProvider.js';
import { LivenessVerificationService } from './modules/identity/application/LivenessVerificationService.js';
import { LivenessVerificationController } from './modules/identity/presentation/LivenessVerificationController.js';
import { PrismaPaymentRepository } from './modules/payment/infrastructure/PrismaPaymentRepository.js';
import { MockPaymentProvider } from './modules/payment/domain/PaymentProvider.js';
import { PaymentService } from './modules/payment/application/PaymentService.js';
import { PaymentController } from './modules/payment/presentation/PaymentController.js';
import { WebhookController } from './modules/payment/presentation/WebhookController.js';
import { RefundController } from './modules/payment/presentation/RefundController.js';

import { InMemoryEventBus } from './modules/realtime/domain/EventBus.js';
import { OutboxRepository } from './modules/realtime/infrastructure/OutboxRepository.js';
import { OutboxRelayer } from './modules/realtime/application/OutboxRelayer.js';
import { EventOutboxService } from './modules/realtime/application/EventOutboxService.js';
import { SseTicketStore } from './modules/realtime/infrastructure/SseTicketStore.js';
import { SseConnectionManager } from './modules/realtime/application/SseConnectionManager.js';
import { RealtimeController } from './modules/realtime/presentation/RealtimeController.js';

import { correlationIdMiddleware } from './shared/middleware/correlationId.middleware.js';
import { requestLoggerMiddleware } from './shared/middleware/requestLogger.middleware.js';
import { errorHandlerMiddleware } from './shared/middleware/errorHandler.middleware.js';
import { 
  requireAuth, 
  requireRole, 
  requireVerifiedStudent,
  optionalAuth,
} from './shared/middleware/auth.middleware.js';
import { 
  authRateLimiter, 
  checkoutRateLimiter, 
  adminRateLimiter 
} from './shared/middleware/rateLimiter.middleware.js';
import { validateRequest } from './shared/middleware/validate.middleware.js';
import {
  registerStudentSchema,
  loginSchema,
  refreshTokenSchema,
  logoutSchema,
  checkoutRequestSchema,
  updateStallStatusSchema,
  updateInventorySchema,
  updateOperatingHoursSchema,
  processAdminRefundSchema,
  counterSettlementSchema,
  createMenuItemSchema,
  updateMenuItemSchema,
  updateMenuItemAvailabilitySchema,
  updateStallCapacitySchema,
  uuidSchema,
  initiatePaymentSchema,
  initiateBalancePaymentSchema,
  processSubOrderRefundSchema,
} from './shared/validation/schemas.js';
import { UserRole } from './modules/identity/domain/IdentityEnums.js';
import { openApiSpec } from './shared/openapi/openapi.js';

export function createApp(): express.Application {
  const app = express();

  // 1. Security Headers (Helmet)
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // 2. Restrictive CORS Policy (Explicit Allowed Origin, No wildcard for authenticated endpoints)
  const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, automated testing)
      if (!origin || origin === allowedOrigin) {
        callback(null, true);
      } else {
        callback(new Error('CORS origin denied by security policy'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-ID'],
  }));

  // 3. Request Body Limit (1MB standard API payload limit) + Raw Body Capture for Webhooks
  app.use(express.json({
    limit: '1mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  }));

  // 4. Request Correlation ID
  app.use(correlationIdMiddleware);

  // 5. Structured Request Logger (Sanitized without credentials or PII)
  app.use(requestLoggerMiddleware);

  // Composition Root / Repositories
  const prisma = PrismaService.getClient();
  const stallRepo = new PrismaStallRepository(prisma);
  const orderRepo = new PrismaOrderRepository(prisma);
  const inventoryRepo = new PrismaInventoryRepository(prisma);
  const auditRepo = new PrismaAuditLogRepository(prisma);
  const idempotencyRepo = new PrismaIdempotencyRepository(prisma);
  const verificationRepo = new PrismaStudentVerificationRepository(prisma);
  const storageProvider = new LocalStorageProvider();
  const paymentRepo = new PrismaPaymentRepository(prisma);
  const paymentProvider = new MockPaymentProvider();

  // Application Services
  const authService = new AuthService(prisma, auditRepo);
  const checkoutService = new CheckoutService(
    orderRepo,
    stallRepo,
    inventoryRepo,
    idempotencyRepo
  );
  const subOrderService = new SubOrderManagementService(orderRepo);
  const verificationService = new StudentVerificationService(
    verificationRepo,
    storageProvider,
    auditRepo,
    prisma
  );
  validateLivenessProviderConfig();
  const livenessProvider = new MockLivenessVerificationProvider();
  const livenessService = new LivenessVerificationService(
    prisma,
    storageProvider,
    livenessProvider,
    auditRepo
  );
  const eventBus = new InMemoryEventBus();
  const outboxRepo = new OutboxRepository(prisma);
  const outboxRelayer = new OutboxRelayer(outboxRepo, eventBus);
  const outboxService = new EventOutboxService(prisma, outboxRepo, outboxRelayer);
  const sseTicketStore = new SseTicketStore();
  const sseConnectionManager = new SseConnectionManager(eventBus, prisma);

  const paymentService = new PaymentService(
    prisma,
    paymentRepo,
    paymentProvider,
    auditRepo,
    idempotencyRepo,
    outboxService
  );

  // Controllers
  const authController = new AuthController(authService);
  const stallController = new StallController(prisma);
  const ownerStallController = new OwnerStallController(prisma, auditRepo);
  const orderController = new OrderController(checkoutService, prisma);
  const subOrderController = new SubOrderController(subOrderService, prisma, auditRepo, outboxService);
  const adminController = new AdminController(prisma, auditRepo);
  const studentVerificationController = new StudentVerificationController(verificationService);
  const adminVerificationController = new AdminVerificationController(verificationService);
  const livenessVerificationController = new LivenessVerificationController(livenessService);
  const paymentController = new PaymentController(paymentService);
  const webhookController = new WebhookController(paymentService);
  const refundController = new RefundController(paymentService, prisma);
  const realtimeController = new RealtimeController(prisma, sseConnectionManager, sseTicketStore, outboxRepo);

  // --- HEALTH & READINESS ENDPOINTS ---
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
    });
  });

  app.get('/ready', async (_req: Request, res: Response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.status(200).json({
        status: 'ok',
        postgres: 'connected',
      });
    } catch {
      res.status(503).json({
        status: 'degraded',
        postgres: 'disconnected',
      });
    }
  });

  // --- OPENAPI DOCUMENTATION ENDPOINTS ---
  app.get('/api/v1/spec', (_req: Request, res: Response) => {
    res.status(200).json(openApiSpec);
  });

  app.get('/api/v1/docs', (_req: Request, res: Response) => {
    res.status(200).json(openApiSpec);
  });

  // --- API V1 ROUTING ---

  // Auth Routes
  app.post(
    '/api/v1/auth/register',
    authRateLimiter,
    validateRequest({ body: registerStudentSchema }),
    authController.registerStudent
  );

  app.post(
    '/api/v1/auth/login',
    authRateLimiter,
    validateRequest({ body: loginSchema }),
    authController.login
  );

  app.post(
    '/api/v1/auth/refresh',
    authRateLimiter,
    validateRequest({ body: refreshTokenSchema }),
    authController.refresh
  );

  app.post(
    '/api/v1/auth/logout',
    optionalAuth,
    validateRequest({ body: logoutSchema }),
    authController.logout
  );

  app.get('/api/v1/auth/me', requireAuth, authController.me);

  // Stall & Menu Routes (Public & Student Browsing)
  app.get('/api/v1/stalls', stallController.getStalls);

  app.get(
    '/api/v1/stalls/:id',
    validateRequest({ params: z.object({ id: uuidSchema }) }),
    stallController.getStallById
  );

  app.get(
    '/api/v1/stalls/:id/menu',
    validateRequest({ params: z.object({ id: uuidSchema }) }),
    stallController.getStallMenu
  );

  // Order & Checkout Routes (Students)
  app.post(
    '/api/v1/orders/checkout',
    requireAuth,
    requireVerifiedStudent,
    checkoutRateLimiter,
    validateRequest({ body: checkoutRequestSchema }),
    orderController.checkout
  );

  app.get('/api/v1/orders', requireAuth, orderController.getMyOrders);

  app.get(
    '/api/v1/orders/:id',
    requireAuth,
    validateRequest({ params: z.object({ id: uuidSchema }) }),
    orderController.getOrderById
  );

  // ==========================================
  // PHASE 5: PAYMENTS, WEBHOOKS & REFUNDS
  // ==========================================

  // Payment Initiation Routes (Advance UPI Deposit)
  app.post(
    '/api/v1/payments/initiate',
    requireAuth,
    requireVerifiedStudent,
    validateRequest({ body: initiatePaymentSchema }),
    paymentController.initiateAdvancePayment
  );

  app.post(
    '/api/v1/payments/advance/initiate',
    requireAuth,
    requireVerifiedStudent,
    validateRequest({ body: initiatePaymentSchema }),
    paymentController.initiateAdvancePayment
  );

  // Online Balance Settlement (UPI) for READY sub-orders
  app.post(
    '/api/v1/payments/balance/online',
    requireAuth,
    requireVerifiedStudent,
    validateRequest({ body: initiateBalancePaymentSchema }),
    paymentController.initiateBalancePayment
  );

  // Payment Status & Attempt History
  app.get(
    '/api/v1/payments/order/:orderId',
    requireAuth,
    validateRequest({ params: z.object({ orderId: uuidSchema }) }),
    paymentController.getPaymentStatus
  );

  // Signed Payment Webhook Settlement
  app.post(
    '/api/v1/webhooks/payments',
    webhookController.handlePaymentWebhook
  );

  // Fault-Isolated Sub-Order Refunds
  app.post(
    '/api/v1/refunds/suborder/:id',
    requireAuth,
    requireRole(UserRole.ADMIN),
    adminRateLimiter,
    validateRequest({ 
      params: z.object({ id: uuidSchema }),
      body: processSubOrderRefundSchema,
    }),
    refundController.processSubOrderRefund
  );

  app.get(
    '/api/v1/refunds/suborder/:id',
    requireAuth,
    validateRequest({ params: z.object({ id: uuidSchema }) }),
    refundController.getRefundStatus
  );

  // Real-Time Event Stream & Kitchen Queue (Phase 6)
  app.post(
    '/api/v1/events/ticket',
    requireAuth,
    authRateLimiter,
    realtimeController.issueTicket
  );

  app.get(
    '/api/v1/events/stream',
    (req: Request, res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        return requireAuth(req, res, () => realtimeController.streamEvents(req, res, next));
      }
      return realtimeController.streamEvents(req, res, next);
    }
  );

  app.get(
    '/api/v1/stalls/:stallId/kitchen/queue',
    requireAuth,
    validateRequest({ params: z.object({ stallId: uuidSchema }) }),
    realtimeController.getKitchenQueue
  );

  // SubOrder Operational Lifecycle Routes (Stall Owner & Staff)
  app.post(
    '/api/v1/sub-orders/:id/confirm',
    requireAuth,
    validateRequest({ params: z.object({ id: uuidSchema }) }),
    subOrderController.confirmOrder
  );

  app.post(
    '/api/v1/sub-orders/:id/prepare',
    requireAuth,
    validateRequest({ params: z.object({ id: uuidSchema }) }),
    subOrderController.prepareOrder
  );

  app.post(
    '/api/v1/sub-orders/:id/ready',
    requireAuth,
    validateRequest({ params: z.object({ id: uuidSchema }) }),
    subOrderController.markOrderReady
  );

  app.post(
    '/api/v1/sub-orders/:id/collect',
    requireAuth,
    validateRequest({ params: z.object({ id: uuidSchema }) }),
    subOrderController.collectOrder
  );

  app.post(
    '/api/v1/sub-orders/:id/counter-settlement',
    requireAuth,
    validateRequest({ 
      params: z.object({ id: uuidSchema }),
      body: counterSettlementSchema,
    }),
    subOrderController.recordCounterSettlement
  );

  app.post(
    '/api/v1/sub-orders/:id/reject',
    requireAuth,
    validateRequest({ params: z.object({ id: uuidSchema }) }),
    subOrderController.rejectSubOrder
  );

  // SubOrder route aliases (/api/v1/orders/suborder/:id/...)
  app.post(
    '/api/v1/orders/suborder/:id/confirm',
    requireAuth,
    validateRequest({ params: z.object({ id: uuidSchema }) }),
    subOrderController.confirmOrder
  );

  app.post(
    '/api/v1/orders/suborder/:id/prepare',
    requireAuth,
    validateRequest({ params: z.object({ id: uuidSchema }) }),
    subOrderController.prepareOrder
  );

  app.post(
    '/api/v1/orders/suborder/:id/ready',
    requireAuth,
    validateRequest({ params: z.object({ id: uuidSchema }) }),
    subOrderController.markOrderReady
  );

  app.post(
    '/api/v1/orders/suborder/:id/collect',
    requireAuth,
    validateRequest({ params: z.object({ id: uuidSchema }) }),
    subOrderController.collectOrder
  );

  app.post(
    '/api/v1/orders/suborder/:id/counter-settlement',
    requireAuth,
    validateRequest({ 
      params: z.object({ id: uuidSchema }),
      body: counterSettlementSchema,
    }),
    subOrderController.recordCounterSettlement
  );

  app.post(
    '/api/v1/orders/suborder/:id/reject',
    requireAuth,
    validateRequest({ params: z.object({ id: uuidSchema }) }),
    subOrderController.rejectSubOrder
  );

  // Stall Owner Operational Routes
  app.get(
    '/api/v1/owner/stall',
    requireAuth,
    requireRole(UserRole.STALL_OWNER, UserRole.ADMIN),
    ownerStallController.getOwnerStall
  );

  app.patch(
    '/api/v1/owner/stall/status',
    requireAuth,
    requireRole(UserRole.STALL_OWNER, UserRole.ADMIN),
    validateRequest({ body: updateStallStatusSchema }),
    ownerStallController.updateStatus
  );

  app.patch(
    '/api/v1/owner/stall/capacity',
    requireAuth,
    requireRole(UserRole.STALL_OWNER, UserRole.ADMIN),
    validateRequest({ body: updateStallCapacitySchema }),
    ownerStallController.updateCapacity
  );

  app.get(
    '/api/v1/owner/stall/menu',
    requireAuth,
    requireRole(UserRole.STALL_OWNER, UserRole.ADMIN),
    ownerStallController.getOwnerMenu
  );

  app.post(
    '/api/v1/owner/stall/menu',
    requireAuth,
    requireRole(UserRole.STALL_OWNER, UserRole.ADMIN),
    validateRequest({ body: createMenuItemSchema }),
    ownerStallController.createMenuItem
  );

  app.patch(
    '/api/v1/owner/stall/menu/:itemId',
    requireAuth,
    requireRole(UserRole.STALL_OWNER, UserRole.ADMIN),
    validateRequest({
      params: z.object({ itemId: uuidSchema }),
      body: updateMenuItemSchema,
    }),
    ownerStallController.updateMenuItem
  );

  app.patch(
    '/api/v1/owner/stall/menu/:itemId/availability',
    requireAuth,
    requireRole(UserRole.STALL_OWNER, UserRole.ADMIN),
    validateRequest({
      params: z.object({ itemId: uuidSchema }),
      body: updateMenuItemAvailabilitySchema,
    }),
    ownerStallController.updateMenuItemAvailability
  );

  app.delete(
    '/api/v1/owner/stall/menu/:itemId',
    requireAuth,
    requireRole(UserRole.STALL_OWNER, UserRole.ADMIN),
    validateRequest({ params: z.object({ itemId: uuidSchema }) }),
    ownerStallController.deleteMenuItem
  );

  app.patch(
    '/api/v1/owner/inventory/:menuItemId',
    requireAuth,
    requireRole(UserRole.STALL_OWNER, UserRole.ADMIN),
    validateRequest({ 
      params: z.object({ menuItemId: uuidSchema }),
      body: updateInventorySchema,
    }),
    ownerStallController.updateInventory
  );

  app.get(
    '/api/v1/owner/orders',
    requireAuth,
    requireRole(UserRole.STALL_OWNER, UserRole.ADMIN),
    ownerStallController.getOwnerOrders
  );

  app.get(
    '/api/v1/owner/stall/orders',
    requireAuth,
    requireRole(UserRole.STALL_OWNER, UserRole.ADMIN),
    ownerStallController.getOwnerOrders
  );

  // Admin Routes
  app.post(
    '/api/v1/admin/operating-hours',
    requireAuth,
    requireRole(UserRole.ADMIN),
    adminRateLimiter,
    validateRequest({ body: updateOperatingHoursSchema }),
    adminController.updateOperatingHours
  );

  app.post(
    '/api/v1/admin/refunds/:subOrderId',
    requireAuth,
    requireRole(UserRole.ADMIN),
    adminRateLimiter,
    validateRequest({ 
      params: z.object({ subOrderId: uuidSchema }),
      body: processAdminRefundSchema,
    }),
    adminController.processRefund
  );

  app.post(
    '/api/v1/admin/audit/verify-chain',
    requireAuth,
    requireRole(UserRole.ADMIN),
    adminRateLimiter,
    adminController.verifyAuditChain
  );

  app.get(
    '/api/v1/admin/audit-logs',
    requireAuth,
    requireRole(UserRole.ADMIN),
    adminController.getAuditLogs
  );

  // ==========================================
  // PHASE 4: STUDENT IDENTITY & VERIFICATION ROUTES
  // ==========================================

  app.get(
    '/api/v1/student/profile',
    requireAuth,
    requireRole(UserRole.STUDENT),
    studentVerificationController.getProfile
  );

  app.get(
    '/api/v1/student/verification/status',
    requireAuth,
    requireRole(UserRole.STUDENT),
    studentVerificationController.getStatus
  );

  app.post(
    '/api/v1/student/verification/document',
    requireAuth,
    requireRole(UserRole.STUDENT),
    documentUploadMiddleware,
    studentVerificationController.submitDocument
  );

  app.get(
    '/api/v1/student/verification/document/:id/url',
    requireAuth,
    requireRole(UserRole.STUDENT),
    validateRequest({ params: z.object({ id: uuidSchema }) }),
    studentVerificationController.getDocumentUrl
  );

  // ==========================================
  // PHASE 7: ACTIVE LIVENESS & ANTI-SPOOFING VERIFICATION ROUTES
  // ==========================================

  // Session Initiation (POST /api/v1/students/verification/liveness/session)
  app.post(
    '/api/v1/students/verification/liveness/session',
    requireAuth,
    requireRole(UserRole.STUDENT),
    livenessVerificationController.createSession
  );
  app.post(
    '/api/v1/student/verification/liveness/session',
    requireAuth,
    requireRole(UserRole.STUDENT),
    livenessVerificationController.createSession
  );

  // Evidence Verification Submission (POST /api/v1/students/verification/liveness/verify)
  app.post(
    '/api/v1/students/verification/liveness/verify',
    requireAuth,
    requireRole(UserRole.STUDENT),
    livenessEvidenceUploadMiddleware,
    livenessVerificationController.verifyLiveness
  );
  app.post(
    '/api/v1/student/verification/liveness/verify',
    requireAuth,
    requireRole(UserRole.STUDENT),
    livenessEvidenceUploadMiddleware,
    livenessVerificationController.verifyLiveness
  );

  // Status Check (GET /api/v1/students/verification/liveness/status)
  app.get(
    '/api/v1/students/verification/liveness/status',
    requireAuth,
    requireRole(UserRole.STUDENT),
    livenessVerificationController.getStatus
  );
  app.get(
    '/api/v1/student/verification/liveness/status',
    requireAuth,
    requireRole(UserRole.STUDENT),
    livenessVerificationController.getStatus
  );

  // ==========================================
  // PHASE 4: ADMIN VERIFICATION QUEUE & ACCOUNT LIFECYCLE
  // ==========================================

  app.get(
    '/api/v1/admin/verifications',
    requireAuth,
    requireRole(UserRole.ADMIN),
    adminRateLimiter,
    adminVerificationController.getQueue
  );

  app.get(
    '/api/v1/admin/verifications/:id/document/url',
    requireAuth,
    requireRole(UserRole.ADMIN),
    adminRateLimiter,
    validateRequest({ params: z.object({ id: uuidSchema }) }),
    adminVerificationController.getDocumentUrl
  );

  app.post(
    '/api/v1/admin/verifications/:id/approve',
    requireAuth,
    requireRole(UserRole.ADMIN),
    adminRateLimiter,
    validateRequest({ params: z.object({ id: uuidSchema }) }),
    adminVerificationController.approve
  );

  app.post(
    '/api/v1/admin/verifications/:id/reject',
    requireAuth,
    requireRole(UserRole.ADMIN),
    adminRateLimiter,
    validateRequest({ params: z.object({ id: uuidSchema }) }),
    adminVerificationController.reject
  );

  app.post(
    '/api/v1/admin/students/:id/suspend',
    requireAuth,
    requireRole(UserRole.ADMIN),
    adminRateLimiter,
    validateRequest({ params: z.object({ id: uuidSchema }) }),
    adminVerificationController.suspendStudent
  );

  app.post(
    '/api/v1/admin/students/:id/reactivate',
    requireAuth,
    requireRole(UserRole.ADMIN),
    adminRateLimiter,
    validateRequest({ params: z.object({ id: uuidSchema }) }),
    adminVerificationController.reactivateStudent
  );

  app.get(
    '/api/v1/admin/verifications/:id/liveness',
    requireAuth,
    requireRole(UserRole.ADMIN),
    adminRateLimiter,
    validateRequest({ params: z.object({ id: uuidSchema }) }),
    livenessVerificationController.getAdminLiveness
  );

  // ==========================================
  // STORAGE: TEMPORARY SIGNED URL ACCESS
  // ==========================================

  app.get('/api/v1/storage/documents/download', async (req: Request, res: Response) => {
    try {
      const storagePath = req.query.path as string;
      const expires = parseInt(req.query.expires as string, 10);
      const signature = req.query.signature as string;

      if (!storagePath || isNaN(expires) || !signature) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Missing or invalid signed URL parameters' },
        });
        return;
      }

      const buffer = await storageProvider.getSignedFile(storagePath, expires, signature);
      res.setHeader('Content-Disposition', `inline; filename="${storagePath}"`);
      res.status(200).send(buffer);
    } catch (error: any) {
      if (error?.name === 'ForbiddenError' || error?.message?.includes('expired') || error?.message?.includes('signature') || error?.message?.includes('traversal')) {
        res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Signed URL has expired or signature is invalid' },
        });
        return;
      }
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Requested document file not found' },
      });
    }
  });

  // 6. Centralized Sanitized Error Handling Middleware
  app.use(errorHandlerMiddleware);

  return app;
}
