export type NotificationCategory =
  | "ORDER"
  | "PAYMENT"
  | "OPERATIONAL"
  | "SYSTEM";

export interface NotificationItem {
  id: string;
  category: NotificationCategory;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  orderId?: string;
  subOrderId?: string;
  actionUrl?: string;
  eventType?: string;
}

export interface NotificationsContextValue {
  notifications: NotificationItem[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
  addNotification: (
    item: Omit<NotificationItem, "id" | "timestamp" | "read">
  ) => void;
}
