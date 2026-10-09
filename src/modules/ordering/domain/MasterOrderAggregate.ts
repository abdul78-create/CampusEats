import { MasterOrderStatus } from './OrderEnums.js';
import { SubOrderAggregate } from './SubOrderAggregate.js';
import { OrderStateValidator } from './OrderStateValidator.js';
import { PaymentRules } from '../../payment/domain/PaymentRules.js';
import { ValidationError, ConflictError } from '../../../shared/errors/DomainErrors.js';

export interface MasterOrderCreateProps {
  id: string;
  studentId: string;
  orderNumber: string;
  advancePercentage: number;
  subOrders: SubOrderAggregate[];
  status?: MasterOrderStatus;
  amountPaid?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class MasterOrderAggregate {
  private readonly _id: string;
  private readonly _studentId: string;
  private readonly _orderNumber: string;
  private _status: MasterOrderStatus;
  private readonly _advancePercentage: number;
  private readonly _totalAmount: number;
  private readonly _advanceAmount: number;
  private readonly _remainingAmount: number;
  private _amountPaid: number;
  private readonly _subOrders: Map<string, SubOrderAggregate> = new Map();
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  constructor(props: MasterOrderCreateProps) {
    if (!props.id || !props.studentId || !props.orderNumber) {
      throw new ValidationError('MasterOrder requires id, studentId, and orderNumber');
    }
    if (!props.subOrders || props.subOrders.length === 0) {
      throw new ValidationError('MasterOrder must contain at least one SubOrder');
    }

    // 1. Advance Percentage Invariant
    PaymentRules.assertValidAdvancePercentage(props.advancePercentage);
    this._advancePercentage = props.advancePercentage;

    // 2. Multi-Stall Invariant: Exactly one SubOrder per participating Stall (no duplicates)
    const seenStalls = new Set<string>();
    for (const subOrder of props.subOrders) {
      if (seenStalls.has(subOrder.stallId)) {
        throw new ConflictError(
          `Cart contains duplicate sub-orders for stall ${subOrder.stallId}. Combine items under a single sub-order.`
        );
      }
      seenStalls.add(subOrder.stallId);
      this._subOrders.set(subOrder.id, subOrder);
    }

    // 3. Exact Monetary Calculations
    const calculatedTotal = Math.round(
      props.subOrders.reduce((sum, so) => sum + so.subtotalAmount, 0) * 100
    ) / 100;
    this._totalAmount = calculatedTotal;

    const split = PaymentRules.calculatePaymentSplit(this._totalAmount, this._advancePercentage);
    this._advanceAmount = split.advanceAmount;
    this._remainingAmount = split.remainingAmount;
    this._amountPaid = props.amountPaid ?? 0.00;

    // 4. Deterministic Multi-Stall Advance Allocation with Zero Penny Drift
    this.allocateAdvanceAcrossSubOrders();

    this._id = props.id;
    this._studentId = props.studentId;
    this._orderNumber = props.orderNumber;
    this._status = props.status || MasterOrderStatus.PENDING_PAYMENT;
    this._createdAt = props.createdAt || new Date();
    this._updatedAt = props.updatedAt || new Date();
  }

  get id(): string { return this._id; }
  get studentId(): string { return this._studentId; }
  get orderNumber(): string { return this._orderNumber; }
  get status(): MasterOrderStatus {
    if (this._subOrders.size > 0) {
      return OrderStateValidator.deriveMasterOrderStatus(Array.from(this._subOrders.values()).map(s => s.status));
    }
    return this._status;
  }
  get advancePercentage(): number { return this._advancePercentage; }
  get totalAmount(): number { return this._totalAmount; }
  get advanceAmount(): number { return this._advanceAmount; }
  get remainingAmount(): number { return this._remainingAmount; }
  get amountPaid(): number { return this._amountPaid; }
  get subOrders(): SubOrderAggregate[] { return Array.from(this._subOrders.values()); }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }

  /**
   * Deterministically distributes advance deposit across sub-orders.
   * Invariant: sum(subOrder.advancePaidAmount) === this.advanceAmount exactly.
   */
  private allocateAdvanceAcrossSubOrders(): void {
    const subOrdersList = Array.from(this._subOrders.values());
    if (subOrdersList.length === 1) {
      subOrdersList[0].setPaymentSplit(this._advanceAmount, this._remainingAmount);
      return;
    }

    // Sort by subtotal descending to deterministically place any rounding penny on the largest sub-order
    subOrdersList.sort((a, b) => b.subtotalAmount - a.subtotalAmount);

    let allocatedAdvanceSum = 0;
    const allocations: { subOrder: SubOrderAggregate; advance: number; balance: number }[] = [];

    for (let i = 0; i < subOrdersList.length; i++) {
      const so = subOrdersList[i];
      if (i === subOrdersList.length - 1) {
        // Last item absorbs any penny rounding discrepancy
        const exactRemainingAdvance = Math.round((this._advanceAmount - allocatedAdvanceSum) * 100) / 100;
        const balance = Math.round((so.subtotalAmount - exactRemainingAdvance) * 100) / 100;
        allocations.push({ subOrder: so, advance: exactRemainingAdvance, balance });
        allocatedAdvanceSum += exactRemainingAdvance;
      } else {
        const itemAdvance = Math.round((so.subtotalAmount * (this._advancePercentage / 100)) * 100) / 100;
        const balance = Math.round((so.subtotalAmount - itemAdvance) * 100) / 100;
        allocations.push({ subOrder: so, advance: itemAdvance, balance });
        allocatedAdvanceSum = Math.round((allocatedAdvanceSum + itemAdvance) * 100) / 100;
      }
    }

    // Apply splits
    for (const alloc of allocations) {
      alloc.subOrder.setPaymentSplit(alloc.advance, alloc.balance);
    }
  }

  /**
   * Confirms payment for the master order and all child sub-orders.
   */
  public markPaymentConfirmed(amountPaid: number): void {
    if (this._status !== MasterOrderStatus.PENDING_PAYMENT) {
      throw new ConflictError(`Cannot confirm payment on order in state ${this._status}`);
    }
    if (amountPaid < this._advanceAmount) {
      throw new ValidationError(
        `Amount paid ₹${amountPaid} is less than required advance deposit ₹${this._advanceAmount}`
      );
    }

    this._amountPaid = amountPaid;
    this._status = MasterOrderStatus.PAYMENT_CONFIRMED;

    for (const subOrder of this._subOrders.values()) {
      subOrder.markPaymentConfirmed();
    }
    this._updatedAt = new Date();
  }

  /**
   * Recalculates composite master order status based on all child sub-order states.
   */
  public refreshCompositeStatus(): MasterOrderStatus {
    const subStatuses = Array.from(this._subOrders.values()).map(s => s.status);
    this._status = OrderStateValidator.deriveMasterOrderStatus(subStatuses);
    this._updatedAt = new Date();
    return this._status;
  }

  public getSubOrder(subOrderId: string): SubOrderAggregate | undefined {
    return this._subOrders.get(subOrderId);
  }
}
