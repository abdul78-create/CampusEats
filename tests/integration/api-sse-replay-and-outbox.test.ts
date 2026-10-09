import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import crypto from 'node:crypto';
import { PrismaService } from '../../src/shared/infrastructure/PrismaService.js';
import { OutboxRepository } from '../../src/modules/realtime/infrastructure/OutboxRepository.js';
import { EventOutboxService } from '../../src/modules/realtime/application/EventOutboxService.js';
import { OutboxRelayer } from '../../src/modules/realtime/application/OutboxRelayer.js';
import { InMemoryEventBus } from '../../src/modules/realtime/domain/EventBus.js';
import { DomainEventType } from '../../src/modules/realtime/domain/RealtimeEnums.js';
import { ForbiddenError, ConflictError } from '../../src/shared/errors/DomainErrors.js';

describe('Phase 6 — Durable Outbox, Monotonic Sequences, Replay & BOLA Defense', () => {
  const prisma = PrismaService.getClient();
  const eventBus = new InMemoryEventBus();
  const outboxRepo = new OutboxRepository(prisma);
  const outboxRelayer = new OutboxRelayer(outboxRepo, eventBus);
  const outboxService = new EventOutboxService(prisma, outboxRepo, outboxRelayer);

  const ts = Date.now().toString(36);
  const channelA = `user:student_replay_${ts}_a`;
  const channelB = `user:student_replay_${ts}_b`;
  const channelRetention = `user:retention_${ts}`;
  const channelConcurrent = `user:concurrent_${ts}`;
  const channelCrash = `user:crash_${ts}`;

  afterAll(async () => {
    await prisma.eventOutbox.deleteMany({
      where: {
        channel: { in: [channelA, channelB, channelRetention, channelConcurrent, channelCrash] },
      },
    });
    await prisma.$disconnect();
  });

  describe('Transactional Outbox Atomic Rollback', () => {
    it('rolls back outbox event atomically when the containing transaction fails', async () => {
      let rolledBackEventId: string | null = null;

      try {
        await prisma.$transaction(async tx => {
          const env = await outboxService.appendTransactionalEvent(tx, {
            channel: channelA,
            eventType: DomainEventType.ORDER_PAYMENT_CONFIRMED,
            aggregateType: 'MasterOrder',
            aggregateId: crypto.randomUUID(),
            correlationId: 'tx_rollback_test',
            payload: {
              masterOrderId: crypto.randomUUID(),
              orderNumber: 'ORD-ROLLBACK',
              amountPaid: 100,
              amountRemaining: 0,
              advancePercentage: 100,
              subOrderIds: [],
            },
          });

          rolledBackEventId = env.id;

          // Intentionally force a transaction error
          throw new Error('Simulated atomic failure during order workflow');
        });
      } catch (err: any) {
        expect(err.message).toBe('Simulated atomic failure during order workflow');
      }

      // Assert event does NOT exist in PostgreSQL EventOutbox table
      const found = await prisma.eventOutbox.findUnique({
        where: { id: rolledBackEventId! },
      });
      expect(found).toBeNull();
    });
  });

  describe('Channel-Scoped Monotonic Sequences', () => {
    it('increments sequence numbers monotonically within the same channel', async () => {
      const env1 = await outboxService.appendEvent({
        channel: channelA,
        eventType: DomainEventType.SUBORDER_CONFIRMED,
        aggregateType: 'SubOrder',
        aggregateId: crypto.randomUUID(),
        correlationId: 'corr_seq_1',
        payload: {
          subOrderId: crypto.randomUUID(),
          subOrderNumber: 'ORD-A-1',
          stallId: crypto.randomUUID(),
          scheduledPickupTime: new Date().toISOString(),
          estimatedPrepMinutes: 10,
        },
      });

      const env2 = await outboxService.appendEvent({
        channel: channelA,
        eventType: DomainEventType.SUBORDER_PREPARING,
        aggregateType: 'SubOrder',
        aggregateId: crypto.randomUUID(),
        correlationId: 'corr_seq_2',
        payload: {
          subOrderId: crypto.randomUUID(),
          subOrderNumber: 'ORD-A-1',
          stallId: crypto.randomUUID(),
          startedAt: new Date().toISOString(),
        },
      });

      const env3 = await outboxService.appendEvent({
        channel: channelA,
        eventType: DomainEventType.SUBORDER_READY,
        aggregateType: 'SubOrder',
        aggregateId: crypto.randomUUID(),
        correlationId: 'corr_seq_3',
        payload: {
          subOrderId: crypto.randomUUID(),
          subOrderNumber: 'ORD-A-1',
          stallId: crypto.randomUUID(),
          readyAt: new Date().toISOString(),
          pickupGraceExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
      });

      expect(Number(env1.sequenceNumber)).toBe(1);
      expect(Number(env2.sequenceNumber)).toBe(2);
      expect(Number(env3.sequenceNumber)).toBe(3);
    });

    it('maintains independent sequence scopes across distinct channels', async () => {
      const envB1 = await outboxService.appendEvent({
        channel: channelB,
        eventType: DomainEventType.ORDER_PAYMENT_CONFIRMED,
        aggregateType: 'MasterOrder',
        aggregateId: crypto.randomUUID(),
        correlationId: 'corr_b_1',
        payload: {
          masterOrderId: crypto.randomUUID(),
          orderNumber: 'ORD-B-1',
          amountPaid: 50,
          amountRemaining: 50,
          advancePercentage: 50,
          subOrderIds: [],
        },
      });

      // Channel B starts at 1, independent of Channel A
      expect(Number(envB1.sequenceNumber)).toBe(1);
    });
  });

  describe('Replay via Last-Event-ID', () => {
    it('replays all subsequent events in exact monotonic order starting after Last-Event-ID', async () => {
      // Find event with sequence 1 on channel A
      const ev1 = await prisma.eventOutbox.findUnique({
        where: { uq_outbox_channel_seq: { channel: channelA, sequenceNumber: 1 } },
      });
      expect(ev1).not.toBeNull();

      // Replay events occurring after ev1.id for authorized channelA
      const replayed = await outboxRepo.getEventsSince(ev1!.id, [channelA]);

      expect(replayed.length).toBe(2); // Sequence 2 and 3
      expect(Number(replayed[0].sequenceNumber)).toBe(2);
      expect(replayed[0].eventType).toBe(DomainEventType.SUBORDER_PREPARING);
      expect(Number(replayed[1].sequenceNumber)).toBe(3);
      expect(replayed[1].eventType).toBe(DomainEventType.SUBORDER_READY);
    });
  });

  describe('BOLA Defense on Replay Requests', () => {
    it('strictly forbids replay when client supplies Last-Event-ID from an unauthorized channel (403 Forbidden)', async () => {
      // Get an event ID from channel B
      const evB = await prisma.eventOutbox.findUnique({
        where: { uq_outbox_channel_seq: { channel: channelB, sequenceNumber: 1 } },
      });
      expect(evB).not.toBeNull();

      // Client authorized ONLY for channel A attempts to pass evB.id (BOLA attack)
      await expect(
        outboxRepo.getEventsSince(evB!.id, [channelA])
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('Issue 1: Two-Dimensional Replay Boundary & RESYNC_REQUIRED (409 Conflict)', () => {
    it('strictly rejects replay with ConflictError (RESYNC_REQUIRED) when Last-Event-ID is older than 2 hours', async () => {
      const oldEventId = crypto.randomUUID();
      const twoHoursTenMinutesAgo = new Date(Date.now() - (2 * 60 * 60 * 1000 + 10 * 60 * 1000));

      await prisma.eventOutbox.create({
        data: {
          id: oldEventId,
          channel: channelRetention,
          sequenceNumber: 1,
          eventType: DomainEventType.ORDER_PAYMENT_CONFIRMED,
          aggregateType: 'MasterOrder',
          aggregateId: crypto.randomUUID(),
          payload: {
            masterOrderId: crypto.randomUUID(),
            orderNumber: 'ORD-OLD-REPLAY',
            amountPaid: 100,
            amountRemaining: 0,
            advancePercentage: 100,
            subOrderIds: [],
          },
          payloadVersion: 1,
          correlationId: 'corr_old_replay',
          createdAt: twoHoursTenMinutesAgo,
          publishedAt: twoHoursTenMinutesAgo,
        },
      });

      // Subsequent event within active stream
      await prisma.eventOutbox.create({
        data: {
          id: crypto.randomUUID(),
          channel: channelRetention,
          sequenceNumber: 2,
          eventType: DomainEventType.SUBORDER_CONFIRMED,
          aggregateType: 'SubOrder',
          aggregateId: crypto.randomUUID(),
          payload: {
            subOrderId: crypto.randomUUID(),
            subOrderNumber: 'ORD-OLD-2',
            stallId: crypto.randomUUID(),
            scheduledPickupTime: new Date().toISOString(),
            estimatedPrepMinutes: 10,
          },
          payloadVersion: 1,
          correlationId: 'corr_old_replay_2',
          createdAt: new Date(),
          publishedAt: new Date(),
        },
      });

      // Attempt replay with event older than 2-hour window
      await expect(
        outboxRepo.getEventsSince(oldEventId, [channelRetention])
      ).rejects.toThrow(ConflictError);

      await expect(
        outboxRepo.getEventsSince(oldEventId, [channelRetention])
      ).rejects.toThrow(/Replay window expired: Last-Event-ID is older than 2 hours/);
    });

    it('successfully replays events when Last-Event-ID is within the 2-hour window', async () => {
      const recentEventId = crypto.randomUUID();
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

      await prisma.eventOutbox.create({
        data: {
          id: recentEventId,
          channel: channelRetention,
          sequenceNumber: 10,
          eventType: DomainEventType.SUBORDER_CONFIRMED,
          aggregateType: 'SubOrder',
          aggregateId: crypto.randomUUID(),
          payload: {
            subOrderId: crypto.randomUUID(),
            subOrderNumber: 'ORD-RECENT-10',
            stallId: crypto.randomUUID(),
            scheduledPickupTime: new Date().toISOString(),
            estimatedPrepMinutes: 10,
          },
          payloadVersion: 1,
          correlationId: 'corr_recent_10',
          createdAt: thirtyMinutesAgo,
          publishedAt: thirtyMinutesAgo,
        },
      });

      await prisma.eventOutbox.create({
        data: {
          id: crypto.randomUUID(),
          channel: channelRetention,
          sequenceNumber: 11,
          eventType: DomainEventType.SUBORDER_READY,
          aggregateType: 'SubOrder',
          aggregateId: crypto.randomUUID(),
          payload: {
            subOrderId: crypto.randomUUID(),
            subOrderNumber: 'ORD-RECENT-10',
            stallId: crypto.randomUUID(),
            readyAt: new Date().toISOString(),
            pickupGraceExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          },
          payloadVersion: 1,
          correlationId: 'corr_recent_11',
          createdAt: new Date(),
          publishedAt: new Date(),
        },
      });

      const replayed = await outboxRepo.getEventsSince(recentEventId, [channelRetention]);
      expect(replayed.length).toBe(1);
      expect(Number(replayed[0].sequenceNumber)).toBe(11);
      expect(replayed[0].eventType).toBe(DomainEventType.SUBORDER_READY);
    });

    it('throws ConflictError (RESYNC_REQUIRED) when sequence gap exceeds MAX_REPLAY_LIMIT (1000)', async () => {
      await prisma.eventOutbox.create({
        data: {
          channel: channelA,
          sequenceNumber: 2000,
          eventType: DomainEventType.KITCHEN_SURGE_ALERT,
          aggregateType: 'Stall',
          aggregateId: crypto.randomUUID(),
          correlationId: 'corr_gap_test',
          payload: {
            stallId: crypto.randomUUID(),
            stallName: 'Test',
            activePreparingCount: 18,
            maxActiveOrders: 20,
            utilizationPercentage: 90,
            isSurgeActive: true,
          },
          publishedAt: new Date(),
        },
      });

      const ev1 = await prisma.eventOutbox.findUnique({
        where: { uq_outbox_channel_seq: { channel: channelA, sequenceNumber: 1 } },
      });

      // Gap is 2000 - 1 = 1999 > 1000 limit
      await expect(
        outboxRepo.getEventsSince(ev1!.id, [channelA], 1000)
      ).rejects.toThrow(ConflictError);

      await expect(
        outboxRepo.getEventsSince(ev1!.id, [channelA], 1000)
      ).rejects.toThrow(/Sequence gap exceeds maximum replay limit/);
    });
  });

  describe('Issue 2: EventOutbox Retention Cleanup Mechanism', () => {
    it('prunes published events older than 2 hours while strictly preserving recent and unpublished events', async () => {
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

      // Event 1: Published > 2 hours old -> SHOULD be pruned
      const expiredPublishedId = crypto.randomUUID();
      await prisma.eventOutbox.create({
        data: {
          id: expiredPublishedId,
          channel: channelRetention,
          sequenceNumber: 100,
          eventType: DomainEventType.ORDER_PAYMENT_CONFIRMED,
          aggregateType: 'MasterOrder',
          aggregateId: crypto.randomUUID(),
          payload: {
            masterOrderId: crypto.randomUUID(),
            orderNumber: 'ORD-EXPIRED',
            amountPaid: 50,
            amountRemaining: 0,
            advancePercentage: 100,
            subOrderIds: [],
          },
          payloadVersion: 1,
          correlationId: 'corr_exp_pub',
          createdAt: threeHoursAgo,
          publishedAt: threeHoursAgo,
        },
      });

      // Event 2: Published < 2 hours old -> MUST BE PRESERVED (active replay guarantee)
      const recentPublishedId = crypto.randomUUID();
      await prisma.eventOutbox.create({
        data: {
          id: recentPublishedId,
          channel: channelRetention,
          sequenceNumber: 101,
          eventType: DomainEventType.ORDER_PAYMENT_CONFIRMED,
          aggregateType: 'MasterOrder',
          aggregateId: crypto.randomUUID(),
          payload: {
            masterOrderId: crypto.randomUUID(),
            orderNumber: 'ORD-RECENT',
            amountPaid: 50,
            amountRemaining: 0,
            advancePercentage: 100,
            subOrderIds: [],
          },
          payloadVersion: 1,
          correlationId: 'corr_rec_pub',
          createdAt: thirtyMinutesAgo,
          publishedAt: thirtyMinutesAgo,
        },
      });

      // Event 3: Unpublished > 2 hours old -> MUST BE PRESERVED (crash recovery safety net)
      const expiredUnpublishedId = crypto.randomUUID();
      await prisma.eventOutbox.create({
        data: {
          id: expiredUnpublishedId,
          channel: channelRetention,
          sequenceNumber: 102,
          eventType: DomainEventType.ORDER_PAYMENT_CONFIRMED,
          aggregateType: 'MasterOrder',
          aggregateId: crypto.randomUUID(),
          payload: {
            masterOrderId: crypto.randomUUID(),
            orderNumber: 'ORD-UNPUB',
            amountPaid: 50,
            amountRemaining: 0,
            advancePercentage: 100,
            subOrderIds: [],
          },
          payloadVersion: 1,
          correlationId: 'corr_exp_unpub',
          createdAt: threeHoursAgo,
          publishedAt: null, // NOT yet published!
        },
      });

      // Execute retention pruning with 2-hour window
      const prunedCount = await outboxRepo.pruneExpiredEvents(2);
      expect(prunedCount).toBeGreaterThanOrEqual(1);

      // Verify Event 1 was deleted
      const foundExpired = await prisma.eventOutbox.findUnique({
        where: { id: expiredPublishedId },
      });
      expect(foundExpired).toBeNull();

      // Verify Event 2 was preserved
      const foundRecent = await prisma.eventOutbox.findUnique({
        where: { id: recentPublishedId },
      });
      expect(foundRecent).not.toBeNull();

      // Verify Event 3 was preserved (unpublished rows are NEVER pruned)
      const foundUnpublished = await prisma.eventOutbox.findUnique({
        where: { id: expiredUnpublishedId },
      });
      expect(foundUnpublished).not.toBeNull();
    });
  });

  describe('Issue 3: Concurrent Same-Channel Sequence Allocation', () => {
    it('safely serializes 15 simultaneous writers to the same channel with zero duplicate sequence numbers and zero gaps', async () => {
      const concurrencyCount = 15;

      // Execute 15 concurrent appends simultaneously to the exact same channel
      const promises = Array.from({ length: concurrencyCount }, (_, i) =>
        outboxService.appendEvent({
          channel: channelConcurrent,
          eventType: DomainEventType.SUBORDER_PREPARING,
          aggregateType: 'SubOrder',
          aggregateId: crypto.randomUUID(),
          correlationId: `corr_concurrent_${i}`,
          payload: {
            subOrderId: crypto.randomUUID(),
            subOrderNumber: `ORD-CONC-${i}`,
            stallId: crypto.randomUUID(),
            startedAt: new Date().toISOString(),
          },
        })
      );

      const envelopes = await Promise.all(promises);

      // Extract and sort allocated sequence numbers
      const allocatedSequences = envelopes
        .map(e => Number(e.sequenceNumber))
        .sort((a, b) => a - b);

      // Assert exactly 15 envelopes received
      expect(allocatedSequences.length).toBe(concurrencyCount);

      // Assert strict uniqueness (no duplicate sequence numbers under concurrency)
      const uniqueSequences = new Set(allocatedSequences);
      expect(uniqueSequences.size).toBe(concurrencyCount);

      // Assert gapless contiguous sequence: [1, 2, 3, ..., 15]
      const expectedSequences = Array.from({ length: concurrencyCount }, (_, i) => i + 1);
      expect(allocatedSequences).toEqual(expectedSequences);
    });
  });

  describe('Issue 4: Dispatcher Crash Recovery & publishedAt Semantics', () => {
    it('recovers unpublished outbox events, dispatches them to EventBus, and updates publishedAt timestamp', async () => {
      const crashEventId = crypto.randomUUID();

      // Simulate a process crash: event was atomically committed to PostgreSQL outbox,
      // but process crashed before immediate EventBus dispatch could run
      await prisma.eventOutbox.create({
        data: {
          id: crashEventId,
          channel: channelCrash,
          sequenceNumber: 1,
          eventType: DomainEventType.SUBORDER_CONFIRMED,
          aggregateType: 'SubOrder',
          aggregateId: crypto.randomUUID(),
          payload: {
            subOrderId: crypto.randomUUID(),
            subOrderNumber: 'ORD-CRASH-01',
            stallId: crypto.randomUUID(),
            scheduledPickupTime: new Date().toISOString(),
            estimatedPrepMinutes: 12,
          },
          payloadVersion: 1,
          correlationId: 'corr_crash_test',
          createdAt: new Date(),
          publishedAt: null, // Un-published due to simulated crash
        },
      });

      // Verify that findUnpublished detects the event
      const unpublishedBefore = await outboxRepo.findUnpublished(50);
      const existsInUnpublished = unpublishedBefore.some(e => e.eventId === crashEventId);
      expect(existsInUnpublished).toBe(true);

      // Register subscriber on EventBus to verify actual publication
      const busReceivedEvents: any[] = [];
      const unsubscribe = eventBus.subscribe(channelCrash, ev => {
        busReceivedEvents.push(ev);
      });

      // Background relayer executes pollAndDispatch()
      const dispatchedCount = await outboxRelayer.pollAndDispatch(50);
      expect(dispatchedCount).toBeGreaterThanOrEqual(1);

      // Verify EventBus received the recovered event
      const receivedCrashEvent = busReceivedEvents.find(e => e.eventId === crashEventId);
      expect(receivedCrashEvent).toBeDefined();
      expect(receivedCrashEvent.eventType).toBe(DomainEventType.SUBORDER_CONFIRMED);

      // Verify PostgreSQL database outbox row has publishedAt set
      const updatedRow = await prisma.eventOutbox.findUnique({
        where: { id: crashEventId },
      });
      expect(updatedRow?.publishedAt).not.toBeNull();
      expect(updatedRow?.publishedAt).toBeInstanceOf(Date);

      // Subsequent poll cycle should not pick up the already-published event
      const unpublishedAfter = await outboxRepo.findUnpublished(50);
      const existsAfter = unpublishedAfter.some(e => e.eventId === crashEventId);
      expect(existsAfter).toBe(false);

      unsubscribe();
    });
  });
});
