import { ValidationError, ConflictError } from '../../../shared/errors/DomainErrors.js';

export interface InventoryRecordProps {
  id: string;
  menuItemId: string;
  availableQuantity: number;
  reservedQuantity: number;
}

export class InventoryRecord {
  private readonly _id: string;
  private readonly _menuItemId: string;
  private _availableQuantity: number;
  private _reservedQuantity: number;

  constructor(props: InventoryRecordProps) {
    if (props.availableQuantity < 0) {
      throw new ValidationError('Available quantity cannot be negative');
    }
    if (props.reservedQuantity < 0) {
      throw new ValidationError('Reserved quantity cannot be negative');
    }

    this._id = props.id;
    this._menuItemId = props.menuItemId;
    this._availableQuantity = props.availableQuantity;
    this._reservedQuantity = props.reservedQuantity;
  }

  get id(): string { return this._id; }
  get menuItemId(): string { return this._menuItemId; }
  get availableQuantity(): number { return this._availableQuantity; }
  get reservedQuantity(): number { return this._reservedQuantity; }
  get isSoldOut(): boolean { return this._availableQuantity <= 0; }

  /**
   * Atomically reserves stock during checkout.
   */
  public reserve(quantity: number): void {
    if (quantity <= 0) {
      throw new ValidationError('Reservation quantity must be at least 1');
    }
    if (this._availableQuantity < quantity) {
      throw new ConflictError(
        `Insufficient inventory for item ${this._menuItemId}. Requested: ${quantity}, Available: ${this._availableQuantity}`
      );
    }

    this._availableQuantity -= quantity;
    this._reservedQuantity += quantity;
  }

  /**
   * Releases stock if checkout times out or payment fails.
   */
  public releaseReservation(quantity: number): void {
    if (quantity <= 0) return;
    const releaseQty = Math.min(this._reservedQuantity, quantity);
    this._reservedQuantity -= releaseQty;
    this._availableQuantity += releaseQty;
  }

  /**
   * Commits reserved stock when payment is successfully confirmed.
   */
  public commitReservation(quantity: number): void {
    if (quantity <= 0) return;
    const commitQty = Math.min(this._reservedQuantity, quantity);
    this._reservedQuantity -= commitQty;
  }

  /**
   * Updates total available quantity (e.g. daily replenishment).
   */
  public replenish(addedQuantity: number): void {
    if (addedQuantity < 0) {
      throw new ValidationError('Replenish quantity cannot be negative');
    }
    this._availableQuantity += addedQuantity;
  }
}
