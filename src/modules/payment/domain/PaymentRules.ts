import { ValidationError } from '../../../shared/errors/DomainErrors.js';

export class PaymentRules {
  public static readonly ALLOWED_ADVANCE_PERCENTAGES = [50, 60, 70, 80, 90, 100] as const;
  public static readonly MINIMUM_ADVANCE_PERCENTAGE = 50;

  /**
   * Validates if a requested advance payment percentage is legally permitted.
   */
  public static isAllowedAdvancePercentage(percentage: number): boolean {
    return (this.ALLOWED_ADVANCE_PERCENTAGES as readonly number[]).includes(percentage);
  }

  /**
   * Asserts validity of advance percentage, throwing ValidationError if invalid.
   */
  public static assertValidAdvancePercentage(percentage: number): void {
    if (!this.isAllowedAdvancePercentage(percentage)) {
      throw new ValidationError(
        `Invalid advance payment percentage: ${percentage}%. Allowed percentages: [${this.ALLOWED_ADVANCE_PERCENTAGES.join(', ')}]% (0% is strictly forbidden)`
      );
    }
  }

  /**
   * Calculates advance amount and remaining balance with exact paise integer arithmetic.
   */
  public static calculatePaymentSplit(totalAmount: number, advancePercentage: number): {
    totalAmount: number;
    advancePercentage: number;
    advanceAmount: number;
    remainingAmount: number;
  } {
    if (totalAmount <= 0) {
      throw new ValidationError('Total amount must be greater than zero');
    }

    this.assertValidAdvancePercentage(advancePercentage);

    const totalPaise = Math.round(totalAmount * 100);
    const advancePaise = Math.round((totalPaise * advancePercentage) / 100);
    const remainingPaise = totalPaise - advancePaise;

    return {
      totalAmount: totalPaise / 100,
      advancePercentage,
      advanceAmount: advancePaise / 100,
      remainingAmount: remainingPaise / 100,
    };
  }

  /**
   * Allocates advance and balance across multiple sub-orders, maintaining penny-perfect integrity
   * with deterministic penny reconciliation to the largest subtotal using integer paise.
   */
  public static allocateSubOrderSplits(
    subOrderTotals: { subOrderId: string; subtotal: number }[],
    advancePercentage: number
  ): { subOrderId: string; advanceAmount: number; balanceDue: number }[] {
    if (!subOrderTotals || subOrderTotals.length === 0) {
      return [];
    }

    this.assertValidAdvancePercentage(advancePercentage);

    // Convert all subtotals to integer paise
    const subTotalsPaise = subOrderTotals.map(s => ({
      subOrderId: s.subOrderId,
      subtotalPaise: Math.round(s.subtotal * 100),
    }));

    const masterTotalPaise = subTotalsPaise.reduce((sum, so) => sum + so.subtotalPaise, 0);
    const masterAdvancePaise = Math.round((masterTotalPaise * advancePercentage) / 100);

    // Initial proportional advance calculation in paise
    const splits = subTotalsPaise.map(item => {
      const advPaise = Math.round((item.subtotalPaise * advancePercentage) / 100);
      return {
        subOrderId: item.subOrderId,
        subtotalPaise: item.subtotalPaise,
        advancePaise: advPaise,
        balancePaise: item.subtotalPaise - advPaise,
      };
    });

    // Reconcile discrepancy in integer paise
    const sumAdvancesPaise = splits.reduce((sum, s) => sum + s.advancePaise, 0);
    const deltaPaise = masterAdvancePaise - sumAdvancesPaise;

    if (deltaPaise !== 0) {
      // Find sub-order with largest subtotal (tie-break by subOrderId)
      let largestIdx = 0;
      for (let i = 1; i < splits.length; i++) {
        if (
          splits[i].subtotalPaise > splits[largestIdx].subtotalPaise ||
          (splits[i].subtotalPaise === splits[largestIdx].subtotalPaise && splits[i].subOrderId < splits[largestIdx].subOrderId)
        ) {
          largestIdx = i;
        }
      }

      splits[largestIdx].advancePaise += deltaPaise;
      splits[largestIdx].balancePaise = splits[largestIdx].subtotalPaise - splits[largestIdx].advancePaise;
    }

    return splits.map(s => ({
      subOrderId: s.subOrderId,
      advanceAmount: s.advancePaise / 100,
      balanceDue: s.balancePaise / 100,
    }));
  }
}
