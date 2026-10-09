import { EventEmitter } from 'node:events';
import { DomainEventEnvelope } from './RealtimeInterfaces.js';

export interface IEventBus {
  publish(event: DomainEventEnvelope): Promise<void>;
  publish(channel: string, event: DomainEventEnvelope): Promise<void>;
  subscribe(channel: string, handler: (event: DomainEventEnvelope) => void): () => void;
}

export class InMemoryEventBus implements IEventBus {
  private emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
    // Allow large numbers of concurrent SSE connection listeners without warnings
    this.emitter.setMaxListeners(1000);
  }

  async publish(channelOrEvent: string | DomainEventEnvelope, maybeEvent?: DomainEventEnvelope): Promise<void> {
    const channel = typeof channelOrEvent === 'string' ? channelOrEvent : channelOrEvent.channel;
    const event = typeof channelOrEvent === 'string' ? maybeEvent! : channelOrEvent;
    this.emitter.emit(channel, event);
    // Also emit to a global wildcard channel for system-level monitoring/relayers if needed
    this.emitter.emit('*', channel, event);
  }

  subscribe(channel: string, handler: (event: DomainEventEnvelope) => void): () => void {
    this.emitter.on(channel, handler);
    return () => {
      this.emitter.off(channel, handler);
    };
  }
}
