import { OutboxRepository } from '../infrastructure/OutboxRepository.js';
import { IEventBus } from '../domain/EventBus.js';
import { DomainEventEnvelope } from '../domain/RealtimeInterfaces.js';

export class OutboxRelayer {
  private timer: NodeJS.Timeout | null = null;
  private isPolling = false;

  constructor(
    private readonly outboxRepo: OutboxRepository,
    private readonly eventBus: IEventBus
  ) {}

  /**
   * Directly dispatches a committed event to the EventBus and updates its published status.
   * Called immediately post-commit for lowest latency.
   */
  async publishDirectly(envelope: DomainEventEnvelope): Promise<void> {
    try {
      await this.eventBus.publish(envelope.channel, envelope);
      await this.outboxRepo.markPublished([envelope.eventId]);
    } catch (error) {
      // Do not throw: the background relayer will pick up unpublished rows on the next poll
      console.error(`[OutboxRelayer] Immediate publication failed for event ${envelope.eventId}:`, error);
    }
  }

  /**
   * Polls the outbox table for unpublished events and broadcasts them to the EventBus.
   * Acts as the crash recovery safety net if immediate dispatch or LISTEN/NOTIFY is missed.
   */
  async pollAndDispatch(limit: number = 50): Promise<number> {
    if (this.isPolling) return 0;
    this.isPolling = true;

    try {
      const unpublished = await this.outboxRepo.findUnpublished(limit);
      if (unpublished.length === 0) return 0;

      const publishedIds: string[] = [];

      for (const event of unpublished) {
        try {
          await this.eventBus.publish(event.channel, event);
          publishedIds.push(event.eventId);
        } catch (err) {
          console.error(`[OutboxRelayer] Failed to publish event ${event.eventId}:`, err);
        }
      }

      if (publishedIds.length > 0) {
        await this.outboxRepo.markPublished(publishedIds);
      }

      return publishedIds.length;
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Prunes published outbox events older than the 2-hour retention limit.
   */
  async pruneExpired(retentionHours: number = 2): Promise<number> {
    return this.outboxRepo.pruneExpiredEvents(retentionHours);
  }

  start(intervalMs: number = 2000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.pollAndDispatch().catch(err => {
        console.error('[OutboxRelayer] Error during poll cycle:', err);
      });
      // Run retention pruning periodically (once every 100 cycles / ~3 minutes in dev)
      if (Math.random() < 0.05) {
        this.pruneExpired().catch(err => {
          console.error('[OutboxRelayer] Error during retention pruning:', err);
        });
      }
    }, intervalMs);

    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
