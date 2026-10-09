import { SubOrderStatus, MasterOrderStatus } from './OrderEnums.js';
import { InvalidStateTransitionError } from '../../../shared/errors/DomainErrors.js';

export class OrderStateValidator {
  /**
   * Allowed state transitions for a SubOrder.
   */
  private static readonly ALLOWED_SUB_ORDER_TRANSITIONS: Record<SubOrderStatus, readonly SubOrderStatus[]> = {
    [SubOrderStatus.PENDING_PAYMENT]: [
      SubOrderStatus.PAYMENT_CONFIRMED,
      SubOrderStatus.PAYMENT_FAILED,
    ],
    [SubOrderStatus.PAYMENT_CONFIRMED]: [
      SubOrderStatus.CONFIRMED,
      SubOrderStatus.REJECTED,
    ],
    [SubOrderStatus.CONFIRMED]: [
      SubOrderStatus.PREPARING,
      SubOrderStatus.CANCELLED,
    ],
    [SubOrderStatus.PREPARING]: [
      SubOrderStatus.READY,
    ],
    [SubOrderStatus.READY]: [
      SubOrderStatus.COLLECTED,
      SubOrderStatus.EXPIRED,
      SubOrderStatus.MISSED_PICKUP,
    ],
    [SubOrderStatus.REJECTED]: [
      SubOrderStatus.REFUND_PENDING,
    ],
    [SubOrderStatus.CANCELLED]: [
      SubOrderStatus.REFUND_PENDING,
    ],
    [SubOrderStatus.REFUND_PENDING]: [
      SubOrderStatus.REFUNDED,
    ],
    [SubOrderStatus.PAYMENT_FAILED]: [],
    [SubOrderStatus.REFUNDED]: [],
    [SubOrderStatus.COLLECTED]: [],
    [SubOrderStatus.EXPIRED]: [],
    [SubOrderStatus.MISSED_PICKUP]: [],
  };

  /**
   * Evaluates if a proposed SubOrder transition is valid.
   */
  public static canTransitionSubOrder(from: SubOrderStatus, to: SubOrderStatus): boolean {
    const allowed = this.ALLOWED_SUB_ORDER_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  }

  /**
   * Asserts validity of a SubOrder transition, throwing InvalidStateTransitionError if illegal.
   */
  public static assertSubOrderTransition(from: SubOrderStatus, to: SubOrderStatus): void {
    if (!this.canTransitionSubOrder(from, to)) {
      throw new InvalidStateTransitionError('SubOrder', from, to);
    }
  }

  /**
   * Derives composite MasterOrderStatus from the array of child SubOrder statuses.
   */
  public static deriveMasterOrderStatus(subStatuses: SubOrderStatus[]): MasterOrderStatus {
    if (subStatuses.length === 0) {
      return MasterOrderStatus.PENDING_PAYMENT;
    }

    if (subStatuses.every(s => s === SubOrderStatus.PENDING_PAYMENT)) {
      return MasterOrderStatus.PENDING_PAYMENT;
    }

    if (subStatuses.every(s => s === SubOrderStatus.PAYMENT_FAILED)) {
      return MasterOrderStatus.CANCELLED;
    }

    if (subStatuses.every(s => s === SubOrderStatus.REFUNDED || s === SubOrderStatus.REJECTED)) {
      return MasterOrderStatus.REFUNDED;
    }

    if (subStatuses.every(s => s === SubOrderStatus.COLLECTED)) {
      return MasterOrderStatus.COMPLETED;
    }

    const hasAnyTerminalFailure = subStatuses.some(s => 
      s === SubOrderStatus.REJECTED || 
      s === SubOrderStatus.CANCELLED || 
      s === SubOrderStatus.REFUNDED ||
      s === SubOrderStatus.EXPIRED
    );

    const hasAnyActiveOrSuccess = subStatuses.some(s => 
      s === SubOrderStatus.CONFIRMED || 
      s === SubOrderStatus.PREPARING || 
      s === SubOrderStatus.READY || 
      s === SubOrderStatus.COLLECTED
    );

    if (hasAnyTerminalFailure && hasAnyActiveOrSuccess) {
      return MasterOrderStatus.PARTIALLY_FULFILLED;
    }

    return MasterOrderStatus.PAYMENT_CONFIRMED;
  }
}
