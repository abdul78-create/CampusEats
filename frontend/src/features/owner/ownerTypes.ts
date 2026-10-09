import type { StallStatus, SubOrderStatus } from "@/types/api";

export interface OwnerStallCapacity {
  maxActiveOrders: number;
  maxOrdersPerWindow?: number;
  windowDurationMinutes?: number;
  maxOrdersPerPickupInterval?: number;
  pickupIntervalMinutes?: number;
  parallelPreparationLimit: number;
  operationalBufferMinutes: number;
  pickupGracePeriodMinutes?: number;
}

export interface OwnerOperatingHours {
  id?: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
}

export interface OwnerStallData {
  id: string;
  name: string;
  campusBlock?: string | null;
  description?: string | null;
  liveStatus: StallStatus;
  processingMode: string;
  capacity?: OwnerStallCapacity | null;
  operatingHours?: OwnerOperatingHours[];
  menuItems?: OwnerMenuItem[];
}

export interface OwnerMenuItem {
  id: string;
  stallId: string;
  name: string;
  description?: string | null;
  price: number;
  category: string;
  isVegetarian: boolean;
  preparationTimeMinutes: number;
  availabilityState: "AVAILABLE" | "SOLD_OUT" | "UNAVAILABLE" | string;
  availableQuantity: number;
  isSoldOut: boolean;
}

export interface OwnerSubOrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  total: number;
}

export interface OwnerSubOrder {
  id: string;
  subOrderNumber: string;
  masterOrderNumber: string;
  status: SubOrderStatus;
  totalAmount: number;
  advancePaidAmount: number;
  remainingBalanceAmount: number;
  isBalancePaid: boolean;
  pickupSchedule?: {
    scheduledPickupTime: string;
    preparationTimeMinutes: number;
  } | null;
  items: OwnerSubOrderItem[];
}
