import { ValidationError } from '../../../shared/errors/DomainErrors.js';

export interface OrderItemSnapshotProps {
  id: string;
  subOrderId: string;
  menuItemId?: string | null;
  snapshotItemName: string;
  snapshotPrice: number;
  snapshotPrepMinutes: number;
  quantity: number;
  totalPrice: number;
}

/**
 * Immutable Order Item Snapshot preserving historical dish name, price, and prep duration.
 * Even if a vendor later changes prices or renames items on the menu, this snapshot never mutates.
 */
export class OrderItemSnapshot {
  private readonly props: OrderItemSnapshotProps;

  constructor(props: OrderItemSnapshotProps) {
    if (props.quantity <= 0) {
      throw new ValidationError('Order item quantity must be at least 1');
    }
    if (props.snapshotPrice < 0) {
      throw new ValidationError('Order item price cannot be negative');
    }
    if (props.snapshotPrepMinutes < 0) {
      throw new ValidationError('Order item preparation time cannot be negative');
    }

    const calculatedTotal = Math.round(props.snapshotPrice * props.quantity * 100) / 100;
    this.props = {
      ...props,
      totalPrice: calculatedTotal,
    };
    Object.freeze(this.props);
  }

  get id(): string {
    return this.props.id;
  }

  get subOrderId(): string {
    return this.props.subOrderId;
  }

  get menuItemId(): string | null | undefined {
    return this.props.menuItemId;
  }

  get snapshotItemName(): string {
    return this.props.snapshotItemName;
  }

  get snapshotPrice(): number {
    return this.props.snapshotPrice;
  }

  get snapshotPrepMinutes(): number {
    return this.props.snapshotPrepMinutes;
  }

  get quantity(): number {
    return this.props.quantity;
  }

  get totalPrice(): number {
    return this.props.totalPrice;
  }

  public toJSON(): OrderItemSnapshotProps {
    return { ...this.props };
  }
}
