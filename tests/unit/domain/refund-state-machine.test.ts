import { RefundStateMachine } from '../../../src/modules/payment/domain/RefundStateMachine.js';
import { RefundStatus } from '../../../src/modules/payment/domain/PaymentEnums.js';
import { InvalidStateTransitionError } from '../../../src/shared/errors/DomainErrors.js';

describe('RefundStateMachine Domain Transitions', () => {
  test('allows legal transition paths: REFUND_PENDING -> PROCESSING -> REFUNDED', () => {
    expect(RefundStateMachine.canTransition(RefundStatus.REFUND_PENDING, RefundStatus.PROCESSING)).toBe(true);
    expect(RefundStateMachine.canTransition(RefundStatus.PROCESSING, RefundStatus.REFUNDED)).toBe(true);
    expect(() => RefundStateMachine.assertTransition(RefundStatus.REFUND_PENDING, RefundStatus.PROCESSING)).not.toThrow();
    expect(() => RefundStateMachine.assertTransition(RefundStatus.PROCESSING, RefundStatus.REFUNDED)).not.toThrow();
  });

  test('allows direct settlement path: REFUND_PENDING -> REFUNDED', () => {
    expect(RefundStateMachine.canTransition(RefundStatus.REFUND_PENDING, RefundStatus.REFUNDED)).toBe(true);
    expect(() => RefundStateMachine.assertTransition(RefundStatus.REFUND_PENDING, RefundStatus.REFUNDED)).not.toThrow();
  });

  test('allows failure path and retry: REFUND_PENDING -> FAILED -> REFUND_PENDING', () => {
    expect(RefundStateMachine.canTransition(RefundStatus.REFUND_PENDING, RefundStatus.FAILED)).toBe(true);
    expect(RefundStateMachine.canTransition(RefundStatus.FAILED, RefundStatus.REFUND_PENDING)).toBe(true);
    expect(() => RefundStateMachine.assertTransition(RefundStatus.FAILED, RefundStatus.REFUND_PENDING)).not.toThrow();
  });

  test('strictly forbids transitions out of terminal REFUNDED state', () => {
    expect(RefundStateMachine.canTransition(RefundStatus.REFUNDED, RefundStatus.REFUND_PENDING)).toBe(false);
    expect(RefundStateMachine.canTransition(RefundStatus.REFUNDED, RefundStatus.PROCESSING)).toBe(false);
    expect(RefundStateMachine.canTransition(RefundStatus.REFUNDED, RefundStatus.FAILED)).toBe(false);

    expect(() => RefundStateMachine.assertTransition(RefundStatus.REFUNDED, RefundStatus.PROCESSING))
      .toThrow(InvalidStateTransitionError);
  });
});
