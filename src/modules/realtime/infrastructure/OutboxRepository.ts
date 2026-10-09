import { PrismaClient, Prisma } from '@prisma/client';
import crypto from 'node:crypto';
import { DomainEventType } from '../domain/RealtimeEnums.js';
import { DomainEventEnvelope, EVENT_PAYLOAD_SCHEMAS } from '../domain/RealtimeInterfaces.js';
import { ValidationError, ForbiddenError, ConflictError } from '../../../shared/errors/DomainErrors.js';

export interface CreateOutboxEventInput {
  channel: string;
  eventType: DomainEventType;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  correlationId: string;
}

export class OutboxRepository {
  public static readonly MAX_REPLAY_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours strict rolling window
  public static readonly MAX_REPLAY_LIMIT = 1000; // 1,000 events safety limit
  public static readonly DEFAULT_RETENTION_HOURS = 2; // 2 hours physical retention

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Appends an event to the EventOutbox inside an existing database transaction,
   * guaranteeing atomic commitment with the business state change and strict
   * monotonic channel-scoped sequence numbers.
   * Uses pg_advisory_xact_lock to cleanly serialize concurrent writers to the same channel.
   */
  async appendEvent(
    tx: Prisma.TransactionClient,
    input: CreateOutboxEventInput
  ): Promise<DomainEventEnvelope> {
    // 1. Zod schema validation
    const schema = EVENT_PAYLOAD_SCHEMAS[input.eventType];
    if (schema) {
      const parseResult = schema.safeParse(input.payload);
      if (!parseResult.success) {
        throw new ValidationError(
          `Invalid payload for event "${input.eventType}": ${JSON.stringify(parseResult.error.format())}`
        );
      }
    }

    // 2. Compute next monotonic sequence number for the delivery channel.
    // Advisory transaction lock guarantees zero sequence collisions or gaps under high concurrency.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.channel}))`;

    const seqResult = await tx.$queryRaw<{ nextSeq: bigint }[]>`
      SELECT COALESCE(MAX("sequenceNumber"), 0) + 1 AS "nextSeq"
      FROM "EventOutbox"
      WHERE "channel" = ${input.channel}
    `;

    const nextSeq = seqResult[0]?.nextSeq ?? BigInt(1);
    const eventId = crypto.randomUUID();
    const now = new Date();

    // 3. Insert outbox record (immutable)
    const record = await tx.eventOutbox.create({
      data: {
        id: eventId,
        channel: input.channel,
        sequenceNumber: nextSeq,
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload: input.payload as Prisma.InputJsonValue,
        payloadVersion: 1,
        correlationId: input.correlationId,
        createdAt: now,
      },
    });

    return {
      eventId: record.id,
      id: record.id,
      channel: record.channel,
      sequenceNumber: record.sequenceNumber.toString(),
      eventType: record.eventType as DomainEventType,
      aggregateType: record.aggregateType,
      aggregateId: record.aggregateId,
      serverTimestamp: record.createdAt.toISOString(),
      publishedAt: record.createdAt.toISOString(),
      payloadVersion: record.payloadVersion,
      correlationId: record.correlationId,
      payload: record.payload,
    };
  }

  /**
   * Finds an event by its unique ID.
   */
  async findEventById(eventId: string) {
    return this.prisma.eventOutbox.findUnique({
      where: { id: eventId },
    });
  }

  /**
   * Replays missed events for an authorized channel strictly after the specified sequence number.
   */
  async findReplayEvents(
    channel: string,
    afterSequence: bigint,
    limit: number = 100
  ): Promise<DomainEventEnvelope[]> {
    const records = await this.prisma.eventOutbox.findMany({
      where: {
        channel,
        sequenceNumber: { gt: afterSequence },
      },
      orderBy: { sequenceNumber: 'asc' },
      take: limit,
    });

    return records.map(r => ({
      eventId: r.id,
      channel: r.channel,
      sequenceNumber: Number(r.sequenceNumber),
      eventType: r.eventType as DomainEventType,
      aggregateType: r.aggregateType,
      aggregateId: r.aggregateId,
      serverTimestamp: r.createdAt.toISOString(),
      payloadVersion: r.payloadVersion,
      correlationId: r.correlationId,
      payload: r.payload,
    }));
  }

  /**
   * Replays missed events since a specific eventId across authorized channels with BOLA validation.
   * Enforces the contractual 2-dimensional boundary:
   * 1. Event age <= 2 hours (MAX_REPLAY_AGE_MS)
   * 2. Sequence gap / batch size <= 1000 events (MAX_REPLAY_LIMIT)
   */
  async getEventsSince(
    lastEventId: string,
    authorizedChannels: string[],
    maxReplayLimit: number = OutboxRepository.MAX_REPLAY_LIMIT,
    now: Date = new Date()
  ): Promise<DomainEventEnvelope[]> {
    const eventRecord = await this.findEventById(lastEventId);
    if (!eventRecord) {
      throw new ConflictError('Last-Event-ID not found in outbox store');
    }

    // 1. BOLA defense: check if channel of the target event is in authorizedChannels
    if (!authorizedChannels.includes(eventRecord.channel)) {
      throw new ForbiddenError('Unauthorized replay: Last-Event-ID belongs to an unauthorized channel');
    }

    // 2. Rolling 2-hour retention window verification
    const eventAgeMs = now.getTime() - eventRecord.createdAt.getTime();
    if (eventAgeMs > OutboxRepository.MAX_REPLAY_AGE_MS) {
      throw new ConflictError('Replay window expired: Last-Event-ID is older than 2 hours; full snapshot required');
    }

    // 3. Max event count / sequence gap check
    const latestEvent = await this.prisma.eventOutbox.findFirst({
      where: { channel: eventRecord.channel },
      orderBy: { sequenceNumber: 'desc' },
      select: { sequenceNumber: true },
    });

    if (latestEvent) {
      const gap = Number(latestEvent.sequenceNumber - eventRecord.sequenceNumber);
      if (gap > maxReplayLimit) {
        throw new ConflictError('Sequence gap exceeds maximum replay limit; full snapshot required');
      }
    }

    return this.findReplayEvents(eventRecord.channel, eventRecord.sequenceNumber, maxReplayLimit);
  }

  /**
   * Prunes published outbox events older than the retention threshold (default 2 hours).
   * Ensures active replay guarantee is never violated by keeping events <= 2 hours old.
   */
  async pruneExpiredEvents(retentionHours: number = OutboxRepository.DEFAULT_RETENTION_HOURS): Promise<number> {
    const cutoffDate = new Date(Date.now() - retentionHours * 60 * 60 * 1000);
    const result = await this.prisma.eventOutbox.deleteMany({
      where: {
        publishedAt: { not: null },
        createdAt: { lt: cutoffDate },
      },
    });
    return result.count;
  }

  /**
   * Finds unpublished events for background relayer recovery.
   */
  async findUnpublished(limit: number = 50): Promise<DomainEventEnvelope[]> {
    const records = await this.prisma.eventOutbox.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return records.map(r => ({
      eventId: r.id,
      channel: r.channel,
      sequenceNumber: r.sequenceNumber.toString(),
      eventType: r.eventType as DomainEventType,
      aggregateType: r.aggregateType,
      aggregateId: r.aggregateId,
      serverTimestamp: r.createdAt.toISOString(),
      payloadVersion: r.payloadVersion,
      correlationId: r.correlationId,
      payload: r.payload,
    }));
  }

  /**
   * Marks a batch of outbox event IDs as published.
   */
  async markPublished(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;
    await this.prisma.eventOutbox.updateMany({
      where: { id: { in: eventIds } },
      data: { publishedAt: new Date() },
    });
  }
}
