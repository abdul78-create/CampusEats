import { OrderProcessingMode } from './StallEnums.js';

export interface OrderAcceptanceContext {
  stallId: string;
  subOrderId: string;
  currentActiveOrderCount: number;
  maxActiveOrders: number;
  isKitchenCapacityAvailable: boolean;
  areAllItemsAvailable: boolean;
  isPickupTimeFeasible: boolean;
  isManualStaffApproved?: boolean;
  rejectionReason?: string;
}

export interface AcceptanceDecision {
  shouldAccept: boolean;
  mode: OrderProcessingMode;
  reason?: string;
}

export interface OrderAcceptanceStrategy {
  readonly mode: OrderProcessingMode;
  evaluate(context: OrderAcceptanceContext): Promise<AcceptanceDecision>;
}

export class ManualOrderAcceptanceStrategy implements OrderAcceptanceStrategy {
  readonly mode = OrderProcessingMode.MANUAL;

  async evaluate(context: OrderAcceptanceContext): Promise<AcceptanceDecision> {
    if (context.isManualStaffApproved === true) {
      return {
        shouldAccept: true,
        mode: this.mode,
        reason: 'Manually accepted by stall operator',
      };
    }

    if (context.isManualStaffApproved === false) {
      return {
        shouldAccept: false,
        mode: this.mode,
        reason: context.rejectionReason || 'Manually rejected by stall operator',
      };
    }

    return {
      shouldAccept: false,
      mode: this.mode,
      reason: 'Pending manual staff review',
    };
  }
}

export class AutomaticOrderAcceptanceStrategy implements OrderAcceptanceStrategy {
  readonly mode = OrderProcessingMode.AUTOMATIC;

  async evaluate(context: OrderAcceptanceContext): Promise<AcceptanceDecision> {
    if (!context.areAllItemsAvailable) {
      return {
        shouldAccept: false,
        mode: this.mode,
        reason: 'One or more items in the order are sold out or unavailable',
      };
    }

    if (context.currentActiveOrderCount >= context.maxActiveOrders) {
      return {
        shouldAccept: false,
        mode: this.mode,
        reason: `Kitchen active order capacity exceeded (${context.currentActiveOrderCount}/${context.maxActiveOrders})`,
      };
    }

    if (!context.isKitchenCapacityAvailable) {
      return {
        shouldAccept: false,
        mode: this.mode,
        reason: 'Stall kitchen workload currently exceeds allowable processing thresholds',
      };
    }

    if (!context.isPickupTimeFeasible) {
      return {
        shouldAccept: false,
        mode: this.mode,
        reason: 'Requested pickup time cannot be met with current queue delays',
      };
    }

    return {
      shouldAccept: true,
      mode: this.mode,
      reason: 'Automatically accepted: capacity, inventory, and scheduling feasibility confirmed',
    };
  }
}
