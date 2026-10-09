import { PaymentRules } from '../../../src/modules/payment/domain/PaymentRules.js';

describe('Multi-Stall Advance Allocation & Deterministic Penny Reconciliation', () => {
  test('exact zero penny drift across 2 stalls with clean splits', () => {
    const subOrders = [
      { subOrderId: 'stall_1', subtotal: 100.00 },
      { subOrderId: 'stall_2', subtotal: 200.00 },
    ];
    // Master total: ₹300.00. 60% advance = ₹180.00. Remaining = ₹120.00
    const allocations = PaymentRules.allocateSubOrderSplits(subOrders, 60);

    const totalAdvance = allocations.reduce((sum, a) => sum + a.advanceAmount, 0);
    const totalBalance = allocations.reduce((sum, a) => sum + a.balanceDue, 0);

    expect(totalAdvance).toBe(180.00);
    expect(totalBalance).toBe(120.00);
    expect(totalAdvance + totalBalance).toBe(300.00);
  });

  test('deterministic penny reconciliation when 3 odd subtotals create a rounding discrepancy', () => {
    // Subtotals: ₹33.33, ₹33.33, ₹33.34. Master total: ₹100.00
    // 50% advance: Master advance = ₹50.00.
    // Unadjusted 50% splits:
    // stall_a: 33.33 * 0.50 = 16.665 -> round = 16.67
    // stall_b: 33.33 * 0.50 = 16.665 -> round = 16.67
    // stall_c: 33.34 * 0.50 = 16.670 -> round = 16.67
    // Sum = 50.01. Delta = 50.00 - 50.01 = -0.01
    // stall_c has the largest subtotal (33.34), so it absorbs delta (-0.01):
    // stall_c advance becomes 16.66.
    const subOrders = [
      { subOrderId: 'stall_a', subtotal: 33.33 },
      { subOrderId: 'stall_b', subtotal: 33.33 },
      { subOrderId: 'stall_c', subtotal: 33.34 },
    ];

    const allocations = PaymentRules.allocateSubOrderSplits(subOrders, 50);

    const totalAdvance = Math.round(allocations.reduce((sum, a) => sum + a.advanceAmount, 0) * 100) / 100;
    const totalBalance = Math.round(allocations.reduce((sum, a) => sum + a.balanceDue, 0) * 100) / 100;

    expect(totalAdvance).toBe(50.00); // Zero penny drift
    expect(totalBalance).toBe(50.00);
    expect(totalAdvance + totalBalance).toBe(100.00);

    const stallC = allocations.find(a => a.subOrderId === 'stall_c')!;
    expect(stallC.advanceAmount).toBe(16.66); // Absorbed discrepancy
    expect(stallC.balanceDue).toBe(16.68);
  });

  test('deterministic penny reconciliation with 70% advance on odd amounts', () => {
    const subOrders = [
      { subOrderId: 'stall_small', subtotal: 45.50 },
      { subOrderId: 'stall_large', subtotal: 125.75 },
    ];
    // Master total: 171.25. 70% advance = round(171.25 * 0.70) = round(119.875) = 119.88
    // Master remaining = 171.25 - 119.88 = 51.37
    const allocations = PaymentRules.allocateSubOrderSplits(subOrders, 70);

    const totalAdvance = Math.round(allocations.reduce((sum, a) => sum + a.advanceAmount, 0) * 100) / 100;
    const totalBalance = Math.round(allocations.reduce((sum, a) => sum + a.balanceDue, 0) * 100) / 100;

    expect(totalAdvance).toBe(119.88);
    expect(totalBalance).toBe(51.37);
    expect(Math.round((totalAdvance + totalBalance) * 100) / 100).toBe(171.25);
  });
});
