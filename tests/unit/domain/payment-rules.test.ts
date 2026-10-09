import { PaymentRules } from '../../../src/modules/payment/domain/PaymentRules.js';
import { ValidationError } from '../../../src/shared/errors/DomainErrors.js';

describe('PaymentRules Advance Percentage Constraints', () => {
  test('accepts all legally allowed advance percentages (50%, 60%, 70%, 80%, 90%, 100%)', () => {
    const validTiers = [50, 60, 70, 80, 90, 100];
    for (const tier of validTiers) {
      expect(PaymentRules.isAllowedAdvancePercentage(tier)).toBe(true);
      expect(() => PaymentRules.assertValidAdvancePercentage(tier)).not.toThrow();
    }
  });

  test('strictly rejects 0% advance (Cash on delivery forbidden)', () => {
    expect(PaymentRules.isAllowedAdvancePercentage(0)).toBe(false);
    expect(() => PaymentRules.assertValidAdvancePercentage(0)).toThrow(ValidationError);
  });

  test('rejects percentages below 50% minimum threshold', () => {
    const invalidTiers = [-10, 15, 25, 49];
    for (const tier of invalidTiers) {
      expect(PaymentRules.isAllowedAdvancePercentage(tier)).toBe(false);
      expect(() => PaymentRules.assertValidAdvancePercentage(tier)).toThrow(ValidationError);
    }
  });

  test('rejects non-discrete arbitrary percentages and values over 100%', () => {
    const invalidTiers = [55, 75, 95, 105, 200];
    for (const tier of invalidTiers) {
      expect(PaymentRules.isAllowedAdvancePercentage(tier)).toBe(false);
      expect(() => PaymentRules.assertValidAdvancePercentage(tier)).toThrow(ValidationError);
    }
  });
});

describe('PaymentRules Mathematical Splits', () => {
  test('accurately calculates 50% advance and remaining balance', () => {
    const split = PaymentRules.calculatePaymentSplit(250.00, 50);
    expect(split.totalAmount).toBe(250.00);
    expect(split.advancePercentage).toBe(50);
    expect(split.advanceAmount).toBe(125.00);
    expect(split.remainingAmount).toBe(125.00);
  });

  test('accurately calculates 70% advance on odd amounts with 2-decimal rounding', () => {
    const split = PaymentRules.calculatePaymentSplit(145.50, 70);
    // 145.50 * 0.70 = 101.85
    expect(split.advanceAmount).toBe(101.85);
    expect(split.remainingAmount).toBe(43.65);
    expect(split.advanceAmount + split.remainingAmount).toBe(145.50);
  });

  test('allocates proportional advance splits across multi-stall sub-orders', () => {
    const subOrders = [
      { subOrderId: 'sub_stall_a', subtotal: 100.00 }, // Samosa Stall A
      { subOrderId: 'sub_stall_b', subtotal: 80.00 },  // Dosa Stall B
    ];

    const allocations = PaymentRules.allocateSubOrderSplits(subOrders, 60);

    expect(allocations).toHaveLength(2);
    expect(allocations[0]).toEqual({
      subOrderId: 'sub_stall_a',
      advanceAmount: 60.00,
      balanceDue: 40.00,
    });
    expect(allocations[1]).toEqual({
      subOrderId: 'sub_stall_b',
      advanceAmount: 48.00,
      balanceDue: 32.00,
    });
  });
});
