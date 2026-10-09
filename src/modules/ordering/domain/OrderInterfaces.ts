import { MasterOrderStatus, SubOrderStatus } from './OrderEnums.js';

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

export interface SubOrderProps {
  id: string;
  masterOrderId: string;
  stallId: string;
  subOrderNumber: string;
  status: SubOrderStatus;
  subtotalAmount: number;
  advancePaidAmount: number;
  balanceDueAmount: number;
  isBalancePaid: boolean;
  pickupGraceExpiresAt?: Date | null;
  items: OrderItemSnapshotProps[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MasterOrderProps {
  id: string;
  studentId: string;
  orderNumber: string;
  status: MasterOrderStatus;
  totalAmount: number;
  advancePercentage: number;
  advanceAmount: number;
  remainingAmount: number;
  amountPaid: number;
  subOrders: SubOrderProps[];
  createdAt: Date;
  updatedAt: Date;
}
