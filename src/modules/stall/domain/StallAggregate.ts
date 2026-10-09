import { StallStatus, OrderProcessingMode } from './StallEnums.js';
import { 
  StallProps, 
  StallCapacityProps, 
  StallOperatingHourProps, 
  StaffAccountProps 
} from './StallInterfaces.js';
import { StallOperatingPolicy } from './StallOperatingPolicy.js';
import { ValidationError } from '../../../shared/errors/DomainErrors.js';

export class StallAggregate {
  private readonly _id: string;
  private readonly _ownerId: string;
  private _name: string;
  private _campusBlock: string;
  private _description?: string | null;
  private _imageUrl?: string | null;
  private _liveStatus: StallStatus;
  private _processingMode: OrderProcessingMode;
  private _isApproved: boolean;
  private _capacity: StallCapacityProps;
  private _operatingHours: StallOperatingHourProps[];
  private _staffAccounts: StaffAccountProps[];

  constructor(props: StallProps) {
    if (!props.id || !props.ownerId || !props.name || !props.campusBlock) {
      throw new ValidationError('Stall requires id, ownerId, name, and campusBlock');
    }

    this._id = props.id;
    this._ownerId = props.ownerId;
    this._name = props.name;
    this._campusBlock = props.campusBlock;
    this._description = props.description;
    this._imageUrl = props.imageUrl;
    this._liveStatus = props.liveStatus || StallStatus.CLOSED;
    this._processingMode = props.processingMode || OrderProcessingMode.MANUAL;
    this._isApproved = props.isApproved ?? false;
    this._capacity = props.capacity || {
      id: `cap_${props.id}`,
      stallId: props.id,
      maxActiveOrders: 20,
      maxOrdersPerWindow: 15,
      windowDurationMinutes: 30,
      maxOrdersPerPickupInterval: 5,
      pickupIntervalMinutes: 10,
      parallelPreparationLimit: 4,
      operationalBufferMinutes: 2,
      pickupGracePeriodMinutes: 15,
    };
    this._operatingHours = props.operatingHours || [];
    this._staffAccounts = [];
  }

  get id(): string { return this._id; }
  get ownerId(): string { return this._ownerId; }
  get name(): string { return this._name; }
  get campusBlock(): string { return this._campusBlock; }
  get description(): string | null | undefined { return this._description; }
  get imageUrl(): string | null | undefined { return this._imageUrl; }
  get liveStatus(): StallStatus { return this._liveStatus; }
  get processingMode(): OrderProcessingMode { return this._processingMode; }
  get isApproved(): boolean { return this._isApproved; }
  get capacity(): StallCapacityProps { return { ...this._capacity }; }
  get operatingHours(): StallOperatingHourProps[] { return [...this._operatingHours]; }
  get staffAccounts(): StaffAccountProps[] { return [...this._staffAccounts]; }

  /**
   * Toggles live operational status, enforcing that opening must fall within official operating hours.
   */
  public setLiveStatus(newStatus: StallStatus, currentTime = new Date()): void {
    StallOperatingPolicy.assertCanTransitionLiveStatus({
      targetStatus: newStatus,
      currentTime,
      operatingHours: this._operatingHours,
    });
    this._liveStatus = newStatus;
  }

  /**
   * Validates whether this stall can accept incoming orders at the given timestamp.
   */
  public assertCanAcceptOrders(currentTime = new Date()): void {
    if (!this._isApproved) {
      throw new ValidationError(`Stall ${this._name} is not yet approved by university admin`);
    }
    StallOperatingPolicy.assertCanAcceptNewOrders({
      liveStatus: this._liveStatus,
      currentTime,
      operatingHours: this._operatingHours,
    });
  }

  /**
   * Updates capacity parameters with strict range validation.
   */
  public updateCapacity(newCapacity: Partial<StallCapacityProps>): void {
    if (newCapacity.maxActiveOrders !== undefined && newCapacity.maxActiveOrders <= 0) {
      throw new ValidationError('maxActiveOrders must be greater than zero');
    }
    if (newCapacity.parallelPreparationLimit !== undefined && newCapacity.parallelPreparationLimit <= 0) {
      throw new ValidationError('parallelPreparationLimit must be at least 1');
    }
    if (newCapacity.operationalBufferMinutes !== undefined && newCapacity.operationalBufferMinutes < 0) {
      throw new ValidationError('operationalBufferMinutes cannot be negative');
    }

    this._capacity = {
      ...this._capacity,
      ...newCapacity,
    };
  }

  /**
   * Sets official operating schedule (Admin only).
   */
  public setOperatingHours(hours: StallOperatingHourProps[]): void {
    this._operatingHours = [...hours];
  }
}
