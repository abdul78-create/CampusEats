import { PrismaClient, Prisma } from '@prisma/client';
import { OutboxRepository, CreateOutboxEventInput } from '../infrastructure/OutboxRepository.js';
import { OutboxRelayer } from './OutboxRelayer.js';
import { DomainEventEnvelope } from '../domain/RealtimeInterfaces.js';

export class EventOutboxService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly outboxRepo: OutboxRepository,
    private readonly outboxRelayer: OutboxRelayer
  ) {}

  /**
   * Appends an event to the EventOutbox inside a transactional client.
   */
  async appendTransactionalEvent(
    tx: Prisma.TransactionClient,
    input: CreateOutboxEventInput
  ): Promise<DomainEventEnvelope> {
    return this.outboxRepo.appendEvent(tx, input);
  }

  /**
   * Appends an event using the root Prisma client (auto-transaction).
   */
  async appendEvent(
    input: CreateOutboxEventInput
  ): Promise<DomainEventEnvelope> {
    return this.prisma.$transaction(async tx => {
      return this.outboxRepo.appendEvent(tx, input);
    });
  }

  /**
   * Dispatches an event envelope directly post-commit to the local EventBus.
   */
  async publishEnvelope(envelope: DomainEventEnvelope): Promise<void> {
    await this.outboxRelayer.publishDirectly(envelope);
  }
}
