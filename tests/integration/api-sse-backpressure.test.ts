import { describe, it, expect, afterAll } from '@jest/globals';
import crypto from 'node:crypto';
import { PrismaService } from '../../src/shared/infrastructure/PrismaService.js';
import { SseConnectionManager } from '../../src/modules/realtime/application/SseConnectionManager.js';
import { InMemoryEventBus } from '../../src/modules/realtime/domain/EventBus.js';
import { OutboxRepository } from '../../src/modules/realtime/infrastructure/OutboxRepository.js';
import { UserRole } from '../../src/modules/identity/domain/IdentityEnums.js';
import { DomainEventType } from '../../src/modules/realtime/domain/RealtimeEnums.js';
import { DomainEventEnvelope } from '../../src/modules/realtime/domain/RealtimeInterfaces.js';

describe('Phase 6 — SSE Backpressure, Buffer Overflow & Concurrency Engine', () => {
  const prisma = PrismaService.getClient();
  const eventBus = new InMemoryEventBus();
  const outboxRepo = new OutboxRepository(prisma);
  const connectionManager = new SseConnectionManager(eventBus, prisma);

  afterAll(async () => {
    connectionManager.destroy();
    await prisma.$disconnect();
  });

  describe('Slow-Consumer Backpressure & Buffer Overflow Disconnect', () => {
    it('forcefully terminates connection with BUFFER_OVERFLOW when slow client queue exceeds 100 frames', () => {
      let isTerminated = false;
      let terminationReason = '';

      // Mock a response that simulates backpressure (write returns false = buffer full)
      const mockSlowRes = {
        write: (chunk: string) => {
          if (chunk.includes('BUFFER_OVERFLOW')) {
            isTerminated = true;
            terminationReason = 'BUFFER_OVERFLOW';
          }
          return false; // Backpressure: socket kernel buffer full
        },
        end: () => {
          isTerminated = true;
        },
      } as any;

      const userId = crypto.randomUUID();
      const channel = `user:${userId}`;

      const conn = connectionManager.registerConnection(
        userId,
        UserRole.STUDENT,
        mockSlowRes,
        [channel]
      );
      const connId = conn.connectionId;

      // Flood 105 events to the channel
      for (let i = 0; i < 105; i++) {
        const event: DomainEventEnvelope = {
          id: crypto.randomUUID(),
          channel,
          sequenceNumber: i + 1,
          eventType: DomainEventType.SUBORDER_CONFIRMED,
          aggregateType: 'SubOrder',
          aggregateId: crypto.randomUUID(),
          correlationId: `corr_flood_${i}`,
          payload: {
            subOrderId: crypto.randomUUID(),
            subOrderNumber: `ORD-${i}`,
            stallId: crypto.randomUUID(),
            scheduledPickupTime: new Date().toISOString(),
            estimatedPrepMinutes: 10,
          },
          publishedAt: new Date().toISOString(),
        };

        eventBus.publish(event);
      }

      // Assert connection was pruned due to BUFFER_OVERFLOW
      expect(isTerminated).toBe(true);
      expect(terminationReason).toBe('BUFFER_OVERFLOW');
      expect((connectionManager as any).connections.has(connId)).toBe(false);
    });
  });

  describe('Clean Connection Teardown on Disconnect', () => {
    it('removes connection from active pool when unregisterConnection is called', () => {
      const mockRes = {
        write: () => true,
        end: () => {},
      } as any;

      const userId = crypto.randomUUID();
      const conn = connectionManager.registerConnection(
        userId,
        UserRole.STUDENT,
        mockRes,
        [`user:${userId}`]
      );
      const connId = conn.connectionId;

      expect((connectionManager as any).connections.has(connId)).toBe(true);

      connectionManager.unregisterConnection(connId);

      expect((connectionManager as any).connections.has(connId)).toBe(false);
    });
  });

  describe('Concurrent Broadcast Delivery', () => {
    it('reliably broadcasts event to 20 concurrent connections without race conditions', async () => {
      const connectionsCount = 20;
      const channel = `stall:concurrent_stall_${Date.now().toString(36)}`;
      const deliveryCounts = new Array(connectionsCount).fill(0);
      const connIds: string[] = [];

      for (let i = 0; i < connectionsCount; i++) {
        const index = i;
        const mockRes = {
          write: (chunk: string) => {
            if (chunk.includes('KITCHEN_ORDER_INCOMING')) {
              deliveryCounts[index]++;
            }
            return true;
          },
          end: () => {},
        } as any;

        const conn = connectionManager.registerConnection(
          crypto.randomUUID(),
          UserRole.STALL_STAFF,
          mockRes,
          [channel]
        );
        connIds.push(conn.connectionId);
      }

      // Dispatch 5 events concurrently
      const events: DomainEventEnvelope[] = Array.from({ length: 5 }, (_, idx) => ({
        id: crypto.randomUUID(),
        channel,
        sequenceNumber: idx + 1,
        eventType: DomainEventType.KITCHEN_ORDER_INCOMING,
        aggregateType: 'SubOrder',
        aggregateId: crypto.randomUUID(),
        correlationId: `corr_conc_${idx}`,
        payload: {
          subOrderId: crypto.randomUUID(),
          subOrderNumber: `ORD-CONC-${idx}`,
          orderNumber: `ORD-CONC`,
          stallId: 'stall_1',
          items: [{ name: 'Samosa', quantity: 2 }],
          scheduledPickupTime: new Date().toISOString(),
          studentFirstName: 'Student',
        },
        publishedAt: new Date().toISOString(),
      }));

      await Promise.all(events.map(ev => Promise.resolve(eventBus.publish(ev))));

      // Every one of the 20 connections must have received all 5 events
      for (let i = 0; i < connectionsCount; i++) {
        expect(deliveryCounts[i]).toBe(5);
        connectionManager.unregisterConnection(connIds[i]);
      }
    });
  });
});
