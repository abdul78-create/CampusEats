import { SubOrderStatus } from './OrderEnums.js';
import { OrderStateValidator } from './OrderStateValidator.js';
import { OrderItemSnapshot } from './OrderItemSnapshot.js';
import { ValidationError, ConflictError } from '../../../shared/errors/DomainErrors.js';

export interface SubOrderPickupScheduleProps {
  id?: string;
  requestedPickupTime: Date;
  scheduledPickupTime: Date;
  earliestFeasiblePickupTime: Date;
  preparationTimeMinutes: number;
  queueDelayMinutes: number;
  operationalBufferMinutes: number;
  capacityConstraintApplied?: boolean;
}

export interface SubOrderCreateProps {
  id: string;
  masterOrderId: string;
  stallId: string;
  subOrderNumber: string;
  items: OrderItemSnapshot[];
  status?: SubOrderStatus;
  advancePaidAmount?: number;
  balanceDueAmount?: number;
  isBalancePaid?: boolean;
  pickupGraceExpiresAt?: Date | null;
  pickupSchedule?: SubOrderPickupScheduleProps;
  createdAt?: Date;
  updatedAt?: Date;
}

export class SubOrderAggregate {
  private readonly _id: string;
  private readonly _masterOrderId: string;
  private readonly _stallId: string;
  private readonly _subOrderNumber: string;
  private _status: SubOrderStatus;
  private _items: OrderItemSnapshot[];
  private _subtotalAmount: number;
  private _advancePaidAmount: number;
  private _balanceDueAmount: number;
  private _isBalancePaid: boolean;
  private _pickupGraceExpiresAt: Date | null;
  private _pickupSchedule?: SubOrderPickupScheduleProps;
  private readonly _createdAt: Date;
  private _updatedAt: Date;

  constructor(props: SubOrderCreateProps) {
    if (!props.id || !props.masterOrderId || !props.stallId) {
      throw new ValidationError('SubOrder requires id, masterOrderId, and stallId');
    }
    if (!props.items || props.items.length === 0) {
      throw new ValidationError('SubOrder must contain at least one item snapshot');
    }

    this._id = props.id;
    this._masterOrderId = props.masterOrderId;
    this._stallId = props.stallId;
    this._subOrderNumber = props.subOrderNumber;
    this._status = props.status || SubOrderStatus.PENDING_PAYMENT;
    this._items = [...props.items];
    this._subtotalAmount = Math.round(
      props.items.reduce((sum, item) => sum + item.totalPrice, 0) * 100
    ) / 100;
    this._advancePaidAmount = props.advancePaidAmount ?? 0;
    this._balanceDueAmount = props.balanceDueAmount ?? this._subtotalAmount;
    this._isBalancePaid = props.isBalancePaid ?? (this._balanceDueAmount <= 0);
    this._pickupGraceExpiresAt = props.pickupGraceExpiresAt ?? null;
    this._pickupSchedule = props.pickupSchedule;
    this._createdAt = props.createdAt || new Date();
    this._updatedAt = props.updatedAt || new Date();
  }

  get id(): string { return this._id; }
  get masterOrderId(): string { return this._masterOrderId; }
  get stallId(): string { return this._stallId; }
  get subOrderNumber(): string { return this._subOrderNumber; }
  get status(): SubOrderStatus { return this._status; }
  get items(): readonly OrderItemSnapshot[] { return Object.freeze([...this._items]); }
  get subtotalAmount(): number { return this._subtotalAmount; }
  get advancePaidAmount(): number { return this._advancePaidAmount; }
  get balanceDueAmount(): number { return this._balanceDueAmount; }
  get isBalancePaid(): boolean { return this._isBalancePaid; }
  get pickupGraceExpiresAt(): Date | null { return this._pickupGraceExpiresAt; }
  get pickupSchedule(): SubOrderPickupScheduleProps | undefined { return this._pickupSchedule; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }

  /**
   * Sets the advance payment allocation for this sub-order.
   */
  public setPaymentSplit(advanceAmount: number, balanceDue: number): void {
    if (this._status !== SubOrderStatus.PENDING_PAYMENT) {
      throw new ConflictError('Cannot alter payment split on an already committed order');
    }
    this._advancePaidAmount = Math.round(advanceAmount * 100) / 100;
    this._balanceDueAmount = Math.round(balanceDue * 100) / 100;
    this._isBalancePaid = this._balanceDueAmount <= 0;
    this._updatedAt = new Date();
  }

  /**
   * Transitions sub-order after successful advance gateway payment.
   */
  public markPaymentConfirmed(): void {
    this.transitionTo(SubOrderStatus.PAYMENT_CONFIRMED);
  }

  /**
   * Stall operator or auto-acceptance engine confirms sub-order for cooking.
   */
  public confirm(): void {
    this.transitionTo(SubOrderStatus.CONFIRMED);
  }

  /**
   * Kitchen starts preparation.
   */
  public startPreparing(): void {
    this.transitionTo(SubOrderStatus.PREPARING);
  }

  /**
   * Kitchen completes preparation; food placed in pickup bay.
   */
  public markReady(pickupGraceExpiresAt: Date): void {
    this._pickupGraceExpiresAt = pickupGraceExpiresAt;
    this.transitionTo(SubOrderStatus.READY);
  }

  /**
   * Settles balance due (either via online UPI balance payment or counter cash settlement).
   */
  public settleBalance(): void {
    this._isBalancePaid = true;
    this._balanceDueAmount = 0.00;
    this._updatedAt = new Date();
  }

  /**
   * Student collects food. Enforces that balance due must be paid.
   */
  public markCollected(): void {
    if (!this._isBalancePaid && this._balanceDueAmount > 0) {
      throw new ValidationError(
        `Cannot mark order as COLLECTED. Remaining balance ₹${this._balanceDueAmount} must be settled first.`
      );
    }
    this.transitionTo(SubOrderStatus.COLLECTED);
  }

  /**
   * Stall rejects sub-order (e.g. out of ingredients or manual rejection). Triggers refund eligibility.
   */
  public reject(_reason?: string): void {
    this.transitionTo(SubOrderStatus.REJECTED);
  }

  /**
   * Operational cancellation (e.g. admin override or emergency stall closure).
   */
  public cancel(_reason?: string): void {
    this.transitionTo(SubOrderStatus.CANCELLED);
  }

  /**
   * Transition to REFUND_PENDING when refund service dispatches to gateway.
   */
  public markRefundPending(): void {
    this.transitionTo(SubOrderStatus.REFUND_PENDING);
  }

  /**
   * Transition to REFUNDED when gateway confirms credit settlement.
   */
  public markRefunded(): void {
    this.transitionTo(SubOrderStatus.REFUNDED);
  }

  /**
   * Transition to EXPIRED if student does not collect before grace period expires. No refund.
   */
  public markExpired(): void {
    this.transitionTo(SubOrderStatus.EXPIRED);
  }

  private transitionTo(newStatus: SubOrderStatus): void {
    OrderStateValidator.assertSubOrderTransition(this._status, newStatus);
    this._status = newStatus;
    this._updatedAt = new Date();
  }
}
