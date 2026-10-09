import { describe, it, expect } from '@jest/globals';
import { SubOrderStatus } from '@prisma/client';
import { KitchenQueueService } from '../../../src/modules/realtime/domain/KitchenQueueService.js';
import { KitchenQueueState } from '../../../src/modules/realtime/domain/RealtimeEnums.js';

describe('KitchenQueueService Operational Domain Engine', () => {
  describe('Operational State Derivation (Preserving Phase 3 Invariants)', () => {
    it('derives QUEUED for PAYMENT_CONFIRMED and CONFIRMED without altering SubOrderStatus', () => {
      const now = new Date();
      expect(
        KitchenQueueService.deriveKitchenQueueState(
          { status: SubOrderStatus.PAYMENT_CONFIRMED, updatedAt: now },
          now
        )
      ).toBe(KitchenQueueState.QUEUED);

      expect(
        KitchenQueueService.deriveKitchenQueueState(
          { status: SubOrderStatus.CONFIRMED, updatedAt: now },
          now
        )
      ).toBe(KitchenQueueState.QUEUED);
    });

    it('derives IN_PREPARATION for PREPARING', () => {
      const now = new Date();
      expect(
        KitchenQueueService.deriveKitchenQueueState(
          { status: SubOrderStatus.PREPARING, updatedAt: now },
          now
        )
      ).toBe(KitchenQueueState.IN_PREPARATION);
    });

    it('derives READY_FOR_PICKUP for READY when pickup grace has not expired', () => {
      const now = new Date();
      const futureExpiry = new Date(now.getTime() + 10 * 60 * 1000);
      expect(
        KitchenQueueService.deriveKitchenQueueState(
          { status: SubOrderStatus.READY, updatedAt: now, pickupGraceExpiresAt: futureExpiry },
          now
        )
      ).toBe(KitchenQueueState.READY_FOR_PICKUP);
    });

    it('derives EXPIRED_UNCOLLECTED for READY when pickup grace has expired', () => {
      const now = new Date();
      const pastExpiry = new Date(now.getTime() - 1000); // 1 sec in past
      expect(
        KitchenQueueService.deriveKitchenQueueState(
          { status: SubOrderStatus.READY, updatedAt: now, pickupGraceExpiresAt: pastExpiry },
          now
        )
      ).toBe(KitchenQueueState.EXPIRED_UNCOLLECTED);
    });

    it('derives COMPLETED for COLLECTED', () => {
      const now = new Date();
      expect(
        KitchenQueueService.deriveKitchenQueueState(
          { status: SubOrderStatus.COLLECTED, updatedAt: now },
          now
        )
      ).toBe(KitchenQueueState.COMPLETED);
    });

    it('derives REJECTED for REJECTED, CANCELLED, REFUND_PENDING, REFUNDED, and PAYMENT_FAILED', () => {
      const now = new Date();
      const rejectStatuses = [
        SubOrderStatus.REJECTED,
        SubOrderStatus.CANCELLED,
        SubOrderStatus.REFUND_PENDING,
        SubOrderStatus.REFUNDED,
        SubOrderStatus.PAYMENT_FAILED,
      ];

      for (const status of rejectStatuses) {
        expect(
          KitchenQueueService.deriveKitchenQueueState({ status, updatedAt: now }, now)
        ).toBe(KitchenQueueState.REJECTED);
      }
    });

    it('derives EXPIRED_UNCOLLECTED for MISSED_PICKUP and EXPIRED', () => {
      const now = new Date();
      expect(
        KitchenQueueService.deriveKitchenQueueState({ status: SubOrderStatus.MISSED_PICKUP, updatedAt: now }, now)
      ).toBe(KitchenQueueState.EXPIRED_UNCOLLECTED);

      expect(
        KitchenQueueService.deriveKitchenQueueState({ status: SubOrderStatus.EXPIRED, updatedAt: now }, now)
      ).toBe(KitchenQueueState.EXPIRED_UNCOLLECTED);
    });
  });

  describe('Explicit Pickup Grace Timestamps Calculation', () => {
    it('calculates graceStart, graceExpiry, and warningAt with 15-minute default', () => {
      const readyAt = new Date('2026-09-25T12:00:00.000Z');
      const now = new Date('2026-09-25T12:05:00.000Z');

      const grace = KitchenQueueService.calculatePickupGrace(readyAt, 15, now);

      expect(grace.graceStart.toISOString()).toBe('2026-09-25T12:00:00.000Z');
      expect(grace.graceExpiry.toISOString()).toBe('2026-09-25T12:15:00.000Z');
      expect(grace.warningAt.toISOString()).toBe('2026-09-25T12:10:00.000Z');
      expect(grace.isWarningActive).toBe(false);
      expect(grace.isExpired).toBe(false);
    });

    it('activates warning flag when within 5 minutes of grace expiry', () => {
      const readyAt = new Date('2026-09-25T12:00:00.000Z');
      // 12:11:00 is within [12:10:00, 12:15:00) warning window
      const nowInWarning = new Date('2026-09-25T12:11:00.000Z');

      const grace = KitchenQueueService.calculatePickupGrace(readyAt, 15, nowInWarning);

      expect(grace.isWarningActive).toBe(true);
      expect(grace.isExpired).toBe(false);
    });

    it('flags expired when now is at or past graceExpiry', () => {
      const readyAt = new Date('2026-09-25T12:00:00.000Z');
      const nowExpired = new Date('2026-09-25T12:15:01.000Z');

      const grace = KitchenQueueService.calculatePickupGrace(readyAt, 15, nowExpired);

      expect(grace.isWarningActive).toBe(false);
      expect(grace.isExpired).toBe(true);
    });
  });

  describe('Deterministic Kitchen Queue Tie-Breaking Sort', () => {
    it('sorts queue by scheduledPickupTime ASC, then createdAt ASC, then id ASC', () => {
      const items = [
        {
          id: 'item-c',
          scheduledPickupTime: new Date('2026-09-25T12:30:00.000Z'),
          createdAt: new Date('2026-09-25T12:00:00.000Z'),
        },
        {
          id: 'item-b',
          scheduledPickupTime: new Date('2026-09-25T12:15:00.000Z'),
          createdAt: new Date('2026-09-25T12:05:00.000Z'),
        },
        {
          id: 'item-a2',
          scheduledPickupTime: new Date('2026-09-25T12:15:00.000Z'),
          createdAt: new Date('2026-09-25T12:00:00.000Z'),
        },
        {
          id: 'item-a1',
          scheduledPickupTime: new Date('2026-09-25T12:15:00.000Z'),
          createdAt: new Date('2026-09-25T12:00:00.000Z'),
        },
      ];

      const sorted = KitchenQueueService.sortKitchenQueue(items);

      // Expected order:
      // 1. item-a1 (pickup: 12:15, created: 12:00, id: item-a1)
      // 2. item-a2 (pickup: 12:15, created: 12:00, id: item-a2)
      // 3. item-b  (pickup: 12:15, created: 12:05, id: item-b)
      // 4. item-c  (pickup: 12:30, created: 12:00, id: item-c)
      expect(sorted.map(s => s.id)).toEqual(['item-a1', 'item-a2', 'item-b', 'item-c']);
    });
  });

  describe('Surge Condition Evaluation (Informational / No Menu Mutation)', () => {
    it('returns surge inactive when utilization < 80%', () => {
      const res = KitchenQueueService.evaluateSurgeCondition(15, 20); // 75%
      expect(res.isSurgeActive).toBe(false);
      expect(res.utilizationPercentage).toBe(75);
    });

    it('returns surge active when utilization >= 80%', () => {
      const res = KitchenQueueService.evaluateSurgeCondition(16, 20); // 80%
      expect(res.isSurgeActive).toBe(true);
      expect(res.utilizationPercentage).toBe(80);

      const res2 = KitchenQueueService.evaluateSurgeCondition(19, 20); // 95%
      expect(res2.isSurgeActive).toBe(true);
      expect(res2.utilizationPercentage).toBe(95);
    });
  });
});
