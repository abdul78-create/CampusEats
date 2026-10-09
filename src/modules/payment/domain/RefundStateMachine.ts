import { RefundStatus } from './PaymentEnums.js';
import { InvalidStateTransitionError } from '../../../shared/errors/DomainErrors.js';

export class RefundStateMachine {
  private static readonly ALLOWED_TRANSITIONS: Record<RefundStatus, readonly RefundStatus[]> = {
    [RefundStatus.REFUND_PENDING]: [
      RefundStatus.PROCESSING,
      RefundStatus.REFUNDED,
      RefundStatus.FAILED,
    ],
    [RefundStatus.PROCESSING]: [
      RefundStatus.REFUNDED,
      RefundStatus.FAILED,
    ],
    [RefundStatus.REFUNDED]: [],
    [RefundStatus.FAILED]: [
      RefundStatus.REFUND_PENDING, // Allow retry if failed
    ],
  };

  public static canTransition(from: RefundStatus, to: RefundStatus): boolean {
    const allowed = this.ALLOWED_TRANSITIONS[from];
    return allowed ? allowed.includes(to) : false;
  }

  public static assertTransition(from: RefundStatus, to: RefundStatus): void {
    if (!this.canTransition(from, to)) {
      throw new InvalidStateTransitionError('Refund', from, to);
    }
  }
}
