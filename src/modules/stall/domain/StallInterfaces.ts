import { 
  StallStatus, 
  OrderProcessingMode, 
  StaffPermissionType, 
  ItemAvailabilityState 
} from './StallEnums.js';

export interface StallCapacityProps {
  id: string;
  stallId: string;
  maxActiveOrders: number;
  maxOrdersPerWindow: number;
  windowDurationMinutes: number;
  maxOrdersPerPickupInterval: number;
  pickupIntervalMinutes: number;
  parallelPreparationLimit: number;
  operationalBufferMinutes: number;
  pickupGracePeriodMinutes: number;
}

export interface StallOperatingHourProps {
  id: string;
  stallId: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

export interface StaffPermissionProps {
  id: string;
  staffAccountId: string;
  permission: StaffPermissionType;
}

export interface StaffAccountProps {
  id: string;
  userId: string;
  stallId: string;
  permissions: StaffPermissionType[];
}

export interface MenuItemInventoryProps {
  id: string;
  menuItemId: string;
  availableQuantity: number;
  reservedQuantity: number;
}

export interface MenuItemProps {
  id: string;
  stallId: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  price: number;
  category: string;
  isVegetarian: boolean;
  ingredients: string[];
  allergens: string[];
  preparationTimeMinutes: number;
  availabilityState: ItemAvailabilityState;
  inventory?: MenuItemInventoryProps | null;
}

export interface StallProps {
  id: string;
  ownerId: string;
  name: string;
  campusBlock: string;
  description?: string | null;
  imageUrl?: string | null;
  liveStatus: StallStatus;
  processingMode: OrderProcessingMode;
  isApproved: boolean;
  capacity?: StallCapacityProps | null;
  operatingHours?: StallOperatingHourProps[];
}
