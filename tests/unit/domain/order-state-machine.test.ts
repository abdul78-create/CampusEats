import { OrderStateValidator } from '../../../src/modules/ordering/domain/OrderStateValidator.js';
import { SubOrderStatus, MasterOrderStatus } from '../../../src/modules/ordering/domain/OrderEnums.js';
import { InvalidStateTransitionError } from '../../../src/shared/errors/DomainErrors.js';

describe('SubOrder State Machine Transitions', () => {
  test('allows standard happy path lifecycle transitions', () => {
    expect(OrderStateValidator.canTransitionSubOrder(SubOrderStatus.PENDING_PAYMENT, SubOrderStatus.PAYMENT_CONFIRMED)).toBe(true);
    expect(OrderStateValidator.canTransitionSubOrder(SubOrderStatus.PAYMENT_CONFIRMED, SubOrderStatus.CONFIRMED)).toBe(true);
    expect(OrderStateValidator.canTransitionSubOrder(SubOrderStatus.CONFIRMED, SubOrderStatus.PREPARING)).toBe(true);
    expect(OrderStateValidator.canTransitionSubOrder(SubOrderStatus.PREPARING, SubOrderStatus.READY)).toBe(true);
    expect(OrderStateValidator.canTransitionSubOrder(SubOrderStatus.READY, SubOrderStatus.COLLECTED)).toBe(true);
  });

  test('allows exception paths (rejection and isolated refund)', () => {
    expect(OrderStateValidator.canTransitionSubOrder(SubOrderStatus.PAYMENT_CONFIRMED, SubOrderStatus.REJECTED)).toBe(true);
    expect(OrderStateValidator.canTransitionSubOrder(SubOrderStatus.REJECTED, SubOrderStatus.REFUND_PENDING)).toBe(true);
    expect(OrderStateValidator.canTransitionSubOrder(SubOrderStatus.REFUND_PENDING, SubOrderStatus.REFUNDED)).toBe(true);
  });

  test('allows uncollected pickup expiry path without refund', () => {
    expect(OrderStateValidator.canTransitionSubOrder(SubOrderStatus.READY, SubOrderStatus.EXPIRED)).toBe(true);
    expect(OrderStateValidator.canTransitionSubOrder(SubOrderStatus.EXPIRED, SubOrderStatus.REFUND_PENDING)).toBe(false);
  });

  test('strictly rejects invalid transitions', () => {
    // COLLECTED -> PREPARING (Illegal: already collected)
    expect(OrderStateValidator.canTransitionSubOrder(SubOrderStatus.COLLECTED, SubOrderStatus.PREPARING)).toBe(false);
    expect(() => OrderStateValidator.assertSubOrderTransition(SubOrderStatus.COLLECTED, SubOrderStatus.PREPARING))
      .toThrow(InvalidStateTransitionError);

    // CANCELLED -> CONFIRMED (Illegal: resurrecting cancelled order)
    expect(OrderStateValidator.canTransitionSubOrder(SubOrderStatus.CANCELLED, SubOrderStatus.CONFIRMED)).toBe(false);
    expect(() => OrderStateValidator.assertSubOrderTransition(SubOrderStatus.CANCELLED, SubOrderStatus.CONFIRMED))
      .toThrow(InvalidStateTransitionError);

    // EXPIRED -> PREPARING (Illegal: cooking expired order)
    expect(OrderStateValidator.canTransitionSubOrder(SubOrderStatus.EXPIRED, SubOrderStatus.PREPARING)).toBe(false);
    expect(() => OrderStateValidator.assertSubOrderTransition(SubOrderStatus.EXPIRED, SubOrderStatus.PREPARING))
      .toThrow(InvalidStateTransitionError);

    // REFUNDED -> PREPARING (Illegal: already settled)
    expect(OrderStateValidator.canTransitionSubOrder(SubOrderStatus.REFUNDED, SubOrderStatus.PREPARING)).toBe(false);
    expect(() => OrderStateValidator.assertSubOrderTransition(SubOrderStatus.REFUNDED, SubOrderStatus.PREPARING))
      .toThrow(InvalidStateTransitionError);
  });
});

describe('MasterOrder Composite Status Derivation', () => {
  test('derives COMPLETED when all sub-orders are COLLECTED', () => {
    const status = OrderStateValidator.deriveMasterOrderStatus([
      SubOrderStatus.COLLECTED,
      SubOrderStatus.COLLECTED,
    ]);
    expect(status).toBe(MasterOrderStatus.COMPLETED);
  });

  test('derives PARTIALLY_FULFILLED when one sub-order succeeds and one is rejected', () => {
    const status = OrderStateValidator.deriveMasterOrderStatus([
      SubOrderStatus.COLLECTED,
      SubOrderStatus.REJECTED,
    ]);
    expect(status).toBe(MasterOrderStatus.PARTIALLY_FULFILLED);
  });

  test('derives REFUNDED when all sub-orders are refunded or rejected', () => {
    const status = OrderStateValidator.deriveMasterOrderStatus([
      SubOrderStatus.REFUNDED,
      SubOrderStatus.REJECTED,
    ]);
    expect(status).toBe(MasterOrderStatus.REFUNDED);
  });

  test('derives PARTIALLY_FULFILLED when SubOrder A is REJECTED, SubOrder B is READY, and SubOrder C is PREPARING', () => {
    const status = OrderStateValidator.deriveMasterOrderStatus([
      SubOrderStatus.REJECTED,
      SubOrderStatus.READY,
      SubOrderStatus.PREPARING,
    ]);
    expect(status).toBe(MasterOrderStatus.PARTIALLY_FULFILLED);
  });
});

