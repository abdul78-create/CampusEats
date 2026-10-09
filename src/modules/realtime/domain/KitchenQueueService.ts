import { SubOrderStatus } from '@prisma/client';
import { KitchenQueueState } from './RealtimeEnums.js';

export interface PickupGraceDetails {
  graceStart: Date;
  graceExpiry: Date;
  warningAt: Date;
  isWarningActive: boolean;
  isExpired: boolean;
}

export class KitchenQueueService {
  public static readonly DEFAULT_GRACE_MINUTES = 15;
  public static readonly WARNING_WINDOW_MINUTES = 5;
  public static readonly SURGE_THRESHOLD_PERCENT = 80;

  /**
   * Derives operational kitchen queue state dynamically from the authoritative SubOrderStatus
   * without mutating or creating a secondary persistent database lifecycle.
   */
  public static deriveKitchenQueueState(
    subOrder: {
      status: SubOrderStatus;
      updatedAt: Date;
      pickupGraceExpiresAt?: Date | null;
    },
    now: Date = new Date()
  ): KitchenQueueState {
    switch (subOrder.status) {
      case SubOrderStatus.PENDING_PAYMENT:
      case SubOrderStatus.PAYMENT_CONFIRMED:
      case SubOrderStatus.CONFIRMED:
        return KitchenQueueState.QUEUED;

      case SubOrderStatus.PREPARING:
        return KitchenQueueState.IN_PREPARATION;

      case SubOrderStatus.READY:
        if (subOrder.pickupGraceExpiresAt && now > subOrder.pickupGraceExpiresAt) {
          return KitchenQueueState.EXPIRED_UNCOLLECTED;
        }
        return KitchenQueueState.READY_FOR_PICKUP;

      case SubOrderStatus.COLLECTED:
        return KitchenQueueState.COMPLETED;

      case SubOrderStatus.MISSED_PICKUP:
      case SubOrderStatus.EXPIRED:
        return KitchenQueueState.EXPIRED_UNCOLLECTED;

      case SubOrderStatus.REJECTED:
      case SubOrderStatus.CANCELLED:
      case SubOrderStatus.REFUND_PENDING:
      case SubOrderStatus.REFUNDED:
      case SubOrderStatus.PAYMENT_FAILED:
        return KitchenQueueState.REJECTED;

      default:
        return KitchenQueueState.QUEUED;
    }
  }

  /**
   * Calculates exact pickup grace timestamps:
   * graceStart = readyAt
   * graceExpiry = readyAt + graceMinutes (default 15m)
   * warningAt = graceExpiry - 5m
   */
  public static calculatePickupGrace(
    readyAt: Date,
    graceMinutes: number = KitchenQueueService.DEFAULT_GRACE_MINUTES,
    now: Date = new Date()
  ): PickupGraceDetails {
    const graceStart = new Date(readyAt);
    const graceExpiry = new Date(graceStart.getTime() + graceMinutes * 60 * 1000);
    const warningAt = new Date(graceExpiry.getTime() - KitchenQueueService.WARNING_WINDOW_MINUTES * 60 * 1000);

    const isWarningActive = now >= warningAt && now < graceExpiry;
    const isExpired = now >= graceExpiry;

    return {
      graceStart,
      graceExpiry,
      warningAt,
      isWarningActive,
      isExpired,
    };
  }

  /**
   * Sorts queue items with strict deterministic tie-breaking:
   * 1. scheduledPickupTime ASC
   * 2. createdAt ASC
   * 3. id ASC
   */
  public static sortKitchenQueue<T extends { scheduledPickupTime?: Date | null; createdAt: Date; id: string }>(
    items: T[]
  ): T[] {
    return [...items].sort((a, b) => {
      // 1. scheduledPickupTime ASC
      const aTime = a.scheduledPickupTime ? a.scheduledPickupTime.getTime() : Infinity;
      const bTime = b.scheduledPickupTime ? b.scheduledPickupTime.getTime() : Infinity;
      if (aTime !== bTime) {
        return aTime - bTime;
      }

      // 2. createdAt ASC
      const aCreated = a.createdAt.getTime();
      const bCreated = b.createdAt.getTime();
      if (aCreated !== bCreated) {
        return aCreated - bCreated;
      }

      // 3. id ASC (deterministic tie-breaking across multi-instances)
      return a.id.localeCompare(b.id);
    });
  }

  /**
   * Evaluates kitchen capacity utilization. Surge is active if active cooking items >= 80% of maxActiveOrders.
   * Note: Invariant: surge alert is informational and never mutates menu availability.
   */
  public static evaluateSurgeCondition(
    activePreparingCount: number,
    maxActiveOrders: number
  ): { isSurgeActive: boolean; utilizationPercentage: number } {
    const safeMax = Math.max(1, maxActiveOrders);
    const utilizationPercentage = Math.round((activePreparingCount / safeMax) * 100);
    const isSurgeActive = utilizationPercentage >= KitchenQueueService.SURGE_THRESHOLD_PERCENT;

    return {
      isSurgeActive,
      utilizationPercentage,
    };
  }
}
