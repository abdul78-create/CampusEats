import { MasterOrderAggregate } from '../../../src/modules/ordering/domain/MasterOrderAggregate.js';
import { SubOrderAggregate } from '../../../src/modules/ordering/domain/SubOrderAggregate.js';
import { OrderItemSnapshot } from '../../../src/modules/ordering/domain/OrderItemSnapshot.js';
import { PaymentRules } from '../../../src/modules/payment/domain/PaymentRules.js';
import { ConflictError, ValidationError } from '../../../src/shared/errors/DomainErrors.js';

describe('MasterOrder Aggregate & Historical Snapshots', () => {
  test('exact monetary arithmetic: ₹100 at 50% = ₹50, ₹101 at 50% = ₹50.50 (Half-Up Policy)', () => {
    // Exact policy: Round half-up to 2 decimal places
    const split100 = PaymentRules.calculatePaymentSplit(100.00, 50);
    expect(split100.advanceAmount).toBe(50.00);
    expect(split100.remainingAmount).toBe(50.00);

    const split101 = PaymentRules.calculatePaymentSplit(101.00, 50);
    expect(split101.advanceAmount).toBe(50.50);
    expect(split101.remainingAmount).toBe(50.50);
    expect(split101.advanceAmount + split101.remainingAmount).toBe(101.00);
  });

  test('deterministic multi-stall payment allocation with zero penny drift', () => {
    // Stall A = ₹100, Stall B = ₹200. Total = ₹300. 60% advance = ₹180
    const itemA = new OrderItemSnapshot({
      id: 'item_snap_1',
      subOrderId: 'sub_a',
      snapshotItemName: 'Samosa',
      snapshotPrice: 50.00,
      snapshotPrepMinutes: 10,
      quantity: 2,
      totalPrice: 100.00,
    });

    const itemB = new OrderItemSnapshot({
      id: 'item_snap_2',
      subOrderId: 'sub_b',
      snapshotItemName: 'Masala Dosa',
      snapshotPrice: 100.00,
      snapshotPrepMinutes: 8,
      quantity: 2,
      totalPrice: 200.00,
    });

    const subOrderA = new SubOrderAggregate({
      id: 'sub_a',
      masterOrderId: 'master_1',
      stallId: 'stall_a',
      subOrderNumber: 'CE-20260924-001-S1',
      items: [itemA],
    });

    const subOrderB = new SubOrderAggregate({
      id: 'sub_b',
      masterOrderId: 'master_1',
      stallId: 'stall_b',
      subOrderNumber: 'CE-20260924-001-S2',
      items: [itemB],
    });

    const masterOrder = new MasterOrderAggregate({
      id: 'master_1',
      studentId: 'student_123',
      orderNumber: 'CE-20260924-001',
      advancePercentage: 60,
      subOrders: [subOrderA, subOrderB],
    });

    expect(masterOrder.totalAmount).toBe(300.00);
    expect(masterOrder.advanceAmount).toBe(180.00);
    expect(masterOrder.remainingAmount).toBe(120.00);

    // Assert exact sum invariant: sum(subOrder.advanceAmount) === masterOrder.advanceAmount
    const totalSubAdvance = masterOrder.subOrders.reduce((sum, so) => sum + so.advancePaidAmount, 0);
    expect(totalSubAdvance).toBe(masterOrder.advanceAmount);

    // Verify sub-order allocations
    expect(subOrderB.advancePaidAmount).toBe(120.00); // 200 * 0.60
    expect(subOrderA.advancePaidAmount).toBe(60.00);  // 100 * 0.60
  });

  test('order item preserves immutable snapshot when live menu item price/prep change later', () => {
    // 1. Initial menu item state: ₹50 / 10 min
    let liveMenuDish = {
      id: 'menu_dosa_1',
      name: 'Masala Dosa',
      price: 50.00,
      prepMinutes: 10,
    };

    // 2. Student places order, creating OrderItemSnapshot
    const snapshot = new OrderItemSnapshot({
      id: 'snap_1',
      subOrderId: 'sub_1',
      menuItemId: liveMenuDish.id,
      snapshotItemName: liveMenuDish.name,
      snapshotPrice: liveMenuDish.price,
      snapshotPrepMinutes: liveMenuDish.prepMinutes,
      quantity: 1,
      totalPrice: 50.00,
    });

    // 3. Vendor later raises price to ₹70 and changes prep time to 15 min
    liveMenuDish.price = 70.00;
    liveMenuDish.prepMinutes = 15;
    liveMenuDish.name = 'Special Ghee Masala Dosa';

    // 4. Verify historical order snapshot remains completely unchanged
    expect(snapshot.snapshotPrice).toBe(50.00);
    expect(snapshot.snapshotPrepMinutes).toBe(10);
    expect(snapshot.snapshotItemName).toBe('Masala Dosa');
    expect(snapshot.totalPrice).toBe(50.00);
  });

  test('rejects duplicate stall sub-orders in single master checkout', () => {
    const item1 = new OrderItemSnapshot({
      id: 'snap_1',
      subOrderId: 'sub_a1',
      snapshotItemName: 'Dosa',
      snapshotPrice: 50.00,
      snapshotPrepMinutes: 10,
      quantity: 1,
      totalPrice: 50.00,
    });
    const item2 = new OrderItemSnapshot({
      id: 'snap_2',
      subOrderId: 'sub_a2',
      snapshotItemName: 'Idli',
      snapshotPrice: 40.00,
      snapshotPrepMinutes: 5,
      quantity: 1,
      totalPrice: 40.00,
    });

    const subOrderA1 = new SubOrderAggregate({
      id: 'sub_a1',
      masterOrderId: 'master_dup',
      stallId: 'stall_a', // Duplicate stall A
      subOrderNumber: 'CE-DUP-S1',
      items: [item1],
    });

    const subOrderA2 = new SubOrderAggregate({
      id: 'sub_a2',
      masterOrderId: 'master_dup',
      stallId: 'stall_a', // Duplicate stall A
      subOrderNumber: 'CE-DUP-S2',
      items: [item2],
    });

    expect(() => {
      new MasterOrderAggregate({
        id: 'master_dup',
        studentId: 'student_1',
        orderNumber: 'CE-DUP',
        advancePercentage: 50,
        subOrders: [subOrderA1, subOrderA2],
      });
    }).toThrow(ConflictError);
  });

  test('rejects post-payment modifications to payment split', () => {
    const item = new OrderItemSnapshot({
      id: 'snap_1',
      subOrderId: 'sub_1',
      snapshotItemName: 'Dosa',
      snapshotPrice: 100.00,
      snapshotPrepMinutes: 8,
      quantity: 1,
      totalPrice: 100.00,
    });

    const subOrder = new SubOrderAggregate({
      id: 'sub_1',
      masterOrderId: 'm_1',
      stallId: 'stall_1',
      subOrderNumber: 'CE-001-S1',
      items: [item],
    });

    const masterOrder = new MasterOrderAggregate({
      id: 'm_1',
      studentId: 'student_1',
      orderNumber: 'CE-001',
      advancePercentage: 50,
      subOrders: [subOrder],
    });

    masterOrder.markPaymentConfirmed(50.00);
    expect(subOrder.status).toBe('PAYMENT_CONFIRMED');

    // Attempting to modify payment split after confirmation throws ConflictError
    expect(() => {
      subOrder.setPaymentSplit(30.00, 70.00);
    }).toThrow(ConflictError);
  });
});
