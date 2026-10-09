import { Request, Response, NextFunction } from 'express';
import { PrismaClient, UserRole, SubOrderStatus } from '@prisma/client';
import { SseConnectionManager } from '../application/SseConnectionManager.js';
import { SseTicketStore } from '../infrastructure/SseTicketStore.js';
import { OutboxRepository } from '../infrastructure/OutboxRepository.js';
import { KitchenQueueService } from '../domain/KitchenQueueService.js';
import { DomainEventType } from '../domain/RealtimeEnums.js';
import { UnauthorizedError, ForbiddenError, NotFoundError, ConflictError } from '../../../shared/errors/DomainErrors.js';

export class RealtimeController {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly sseManager: SseConnectionManager,
    private readonly ticketStore: SseTicketStore,
    private readonly outboxRepo: OutboxRepository
  ) {}

  /**
   * Issues a short-lived (30-second), single-use ticket for browser EventSource handshake.
   */
  public issueTicket = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        throw new UnauthorizedError('Authentication required to issue event stream ticket');
      }

      const authorizedChannels = await this.resolveAuthorizedChannels(user.id, user.role);
      const ticket = this.ticketStore.createTicket(user.id, user.role, authorizedChannels);

      res.status(200).json({
        success: true,
        data: {
          ticket,
          expiresInSeconds: 30,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Authoritative SSE event stream endpoint with Last-Event-ID replay and BOLA defense.
   */
  public streamEvents = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let userId: string;
      let role: string;
      let authorizedChannels: string[];

      // 1. Authenticate via Ticket query param OR standard JWT Bearer header
      const queryTicket = req.query.ticket as string | undefined;

      if (queryTicket) {
        const ticketContext = this.ticketStore.consumeTicket(queryTicket);
        if (!ticketContext) {
          throw new UnauthorizedError('Invalid, expired, or previously consumed event stream ticket');
        }
        userId = ticketContext.userId;
        role = ticketContext.role;
        authorizedChannels = ticketContext.authorizedChannels;
      } else if (req.user) {
        userId = req.user.id;
        role = req.user.role;
        authorizedChannels = await this.resolveAuthorizedChannels(userId, role);
      } else {
        throw new UnauthorizedError('Missing authentication credential or ticket for event stream');
      }

      // 2. Handle Reconnection & Replay via Last-Event-ID header or query param
      const lastEventId = (req.headers['last-event-id'] as string) || (req.query.lastEventId as string);

      if (lastEventId) {
        try {
          // getEventsSince strictly enforces BOLA, 2-hour retention window, and max 1000 event replay gap
          const missedEvents = await this.outboxRepo.getEventsSince(lastEventId, authorizedChannels);

          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.flushHeaders();

          for (const missed of missedEvents) {
            res.write(`id: ${missed.eventId}\nevent: ${missed.eventType}\ndata: ${JSON.stringify(missed)}\n\n`);
          }
        } catch (err) {
          if (err instanceof ConflictError) {
            // Replay window expired (> 2h) or sequence gap > 1000: instruct client to resync
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.flushHeaders();
            res.write(`event: ${DomainEventType.RESYNC_REQUIRED}\ndata: ${JSON.stringify({
              reason: err.message,
              action: 'FETCH_REST_SNAPSHOT',
            })}\n\n`);
          } else {
            // Re-throw (e.g. ForbiddenError for BOLA channel violations)
            throw err;
          }
        }
      }

      // 3. Register live SSE connection
      this.sseManager.registerConnection(userId, role, res, authorizedChannels);
    } catch (error) {
      next(error);
    }
  };

  /**
   * Returns a deterministic operational kitchen queue snapshot for an authorized stall.
   */
  public getKitchenQueue = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user!;
      const stallId = req.params.stallId as string;

      // 1. Authorize user against stall
      const stall = await this.prisma.stall.findUnique({
        where: { id: stallId },
        include: {
          capacity: true,
          staffAccounts: { where: { userId: user.id } },
        },
      });

      if (!stall) {
        throw new NotFoundError('Stall not found');
      }

      const isOwner = stall.ownerId === user.id;
      const isStaff = stall.staffAccounts.length > 0;
      const isAdmin = user.role === UserRole.ADMIN;

      if (!isOwner && !isStaff && !isAdmin) {
        throw new ForbiddenError('Unauthorized: You do not have permission to view this kitchen queue');
      }

      // 2. Fetch active SubOrders
      const activeSubOrders = await this.prisma.subOrder.findMany({
        where: {
          stallId,
          status: {
            in: [SubOrderStatus.PAYMENT_CONFIRMED, SubOrderStatus.PREPARING, SubOrderStatus.READY],
          },
        },
        include: {
          items: true,
          pickupSchedule: true,
          masterOrder: {
            include: { student: { include: { studentProfile: true } } },
          },
        },
      });

      const now = new Date();

      // 3. Derive queue state and exact pickup grace for each item
      const queueItems = activeSubOrders.map(so => {
        const queueState = KitchenQueueService.deriveKitchenQueueState(
          {
            status: so.status,
            updatedAt: so.updatedAt,
            pickupGraceExpiresAt: so.pickupGraceExpiresAt,
          },
          now
        );

        let graceDetails = null;
        if (so.status === SubOrderStatus.READY) {
          graceDetails = KitchenQueueService.calculatePickupGrace(
            so.updatedAt,
            stall.capacity?.pickupGracePeriodMinutes || 15,
            now
          );
        }

        return {
          id: so.id,
          subOrderId: so.id,
          subOrderNumber: so.subOrderNumber,
          masterOrderId: so.masterOrderId,
          orderNumber: so.masterOrder.orderNumber,
          queueState,
          status: so.status,
          scheduledPickupTime: so.pickupSchedule?.scheduledPickupTime || null,
          createdAt: so.createdAt,
          updatedAt: so.updatedAt,
          pickupGraceExpiresAt: so.pickupGraceExpiresAt,
          graceDetails,
          studentFirstName: so.masterOrder.student?.studentProfile?.fullName?.split(' ')[0] || 'Student',
          items: so.items.map(it => ({
            name: it.snapshotItemName,
            quantity: it.quantity,
          })),
        };
      });

      // 4. Deterministic tie-breaking sort
      const sortedQueue = KitchenQueueService.sortKitchenQueue(queueItems);

      // 5. Evaluate kitchen capacity & surge condition
      const maxActive = stall.capacity?.maxActiveOrders || 20;
      const preparingCount = sortedQueue.filter(q => q.status === SubOrderStatus.PREPARING).length;
      const surgeEvaluation = KitchenQueueService.evaluateSurgeCondition(preparingCount, maxActive);

      res.status(200).json({
        success: true,
        data: {
          stallId,
          stallName: stall.name,
          maxActiveOrders: maxActive,
          activePreparingCount: preparingCount,
          surgeEvaluation,
          queueCount: sortedQueue.length,
          queue: sortedQueue,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Resolves authorized channel subscriptions dynamically from PostgreSQL.
   */
  public async resolveAuthorizedChannels(userId: string, role: string): Promise<string[]> {
    const channels: string[] = [`user:${userId}`];

    if (role === UserRole.ADMIN) {
      channels.push('admin:campus');
      return channels;
    }

    if (role === UserRole.STALL_OWNER) {
      const ownedStalls = await this.prisma.stall.findMany({
        where: { ownerId: userId },
        select: { id: true },
      });
      for (const s of ownedStalls) {
        channels.push(`stall:${s.id}`);
      }
    }

    if (role === UserRole.STALL_STAFF) {
      const staffAccount = await this.prisma.staffAccount.findUnique({
        where: { userId },
        select: { stallId: true },
      });
      if (staffAccount) {
        channels.push(`stall:${staffAccount.stallId}`);
      }
    }

    return channels;
  }
}
