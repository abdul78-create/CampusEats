// Stall Domain Enums

export enum StallStatus {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  BUSY = 'BUSY',
  TEMPORARILY_PAUSED = 'TEMPORARILY_PAUSED',
}

export enum OrderProcessingMode {
  MANUAL = 'MANUAL',
  AUTOMATIC = 'AUTOMATIC',
}

export enum StaffPermissionType {
  MANAGE_ORDERS = 'MANAGE_ORDERS',
  MANAGE_MENU = 'MANAGE_MENU',
  VIEW_PAYMENTS = 'VIEW_PAYMENTS',
  VIEW_ANALYTICS = 'VIEW_ANALYTICS',
  MANAGE_INVENTORY = 'MANAGE_INVENTORY',
}

export enum ItemAvailabilityState {
  AVAILABLE = 'AVAILABLE',
  SOLD_OUT = 'SOLD_OUT',
}
