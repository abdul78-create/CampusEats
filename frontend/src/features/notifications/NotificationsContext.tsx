"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { toastSuccess, toastInfo, toastWarning, toastError } from "@/lib/api/errors";
import { useRealtimeSubscription } from "@/features/realtime/useRealtime";
import type { DomainEventEnvelope } from "@/types/api";
import type {
  NotificationItem,
  NotificationsContextValue,
} from "./notificationTypes";

const NOTIFICATIONS_STORAGE_KEY = "ce_notifications";
const MAX_NOTIFICATIONS = 60;

const NotificationsContext = createContext<NotificationsContextValue | undefined>(
  undefined
);

export function NotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Load notifications from localStorage on mount safely
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const stored = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setNotifications(parsed);
          }
        }
      } catch {
        // Ignore corrupted storage
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Sync notifications to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        NOTIFICATIONS_STORAGE_KEY,
        JSON.stringify(notifications)
      );
    } catch {
      // Ignore storage errors
    }
  }, [notifications]);

  const addNotification = useCallback(
    (item: Omit<NotificationItem, "id" | "timestamp" | "read">) => {
      const newNotif: NotificationItem = {
        ...item,
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        read: false,
      };

      setNotifications((prev) => [newNotif, ...prev.slice(0, MAX_NOTIFICATIONS - 1)]);
    },
    []
  );

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  // Listen for realtime domain events and create relevant notifications + toasts
  useRealtimeSubscription("*", (event: DomainEventEnvelope) => {
    const p = (event.payload || {}) as Record<string, unknown>;
    const orderId = (p.masterOrderId || (event.aggregateType === "MasterOrder" ? event.aggregateId : undefined)) as string | undefined;
    const subOrderId = (p.subOrderId || (event.aggregateType === "SubOrder" ? event.aggregateId : undefined)) as string | undefined;
    const orderNum = (p.orderNumber || p.subOrderNumber || "") as string;

    switch (event.eventType) {
      case "ORDER_PAYMENT_CONFIRMED": {
        addNotification({
          category: "PAYMENT",
          title: "Payment Confirmed",
          message: `Advance deposit for order ${orderNum ? `#${orderNum}` : ""} received. Sent to kitchen!`,
          orderId,
          actionUrl: orderId ? `/orders/${orderId}` : "/orders",
          eventType: event.eventType,
        });
        toastSuccess("Payment Confirmed", "Your order has been sent to the kitchen stations.");
        break;
      }

      case "SUBORDER_CONFIRMED": {
        addNotification({
          category: "ORDER",
          title: "Order Confirmed by Stall",
          message: `Stall confirmed sub-order ${orderNum ? `#${orderNum}` : ""}. Scheduled for preparation.`,
          orderId,
          subOrderId,
          actionUrl: orderId ? `/orders/${orderId}` : "/orders",
          eventType: event.eventType,
        });
        toastInfo("Stall Confirmed Order", `Preparation scheduled for sub-order.`);
        break;
      }

      case "SUBORDER_PREPARING": {
        addNotification({
          category: "ORDER",
          title: "Kitchen Preparing",
          message: `Your food ${orderNum ? `(${orderNum})` : ""} is currently sizzling in the kitchen!`,
          orderId,
          subOrderId,
          actionUrl: orderId ? `/orders/${orderId}` : "/orders",
          eventType: event.eventType,
        });
        toastInfo("Kitchen Started Preparing", "Your meal is being freshly cooked.");
        break;
      }

      case "SUBORDER_READY": {
        addNotification({
          category: "ORDER",
          title: "Order Ready for Pickup! 🔔",
          message: `Sub-order ${orderNum ? `#${orderNum}` : ""} is packed and waiting at the counter.`,
          orderId,
          subOrderId,
          actionUrl: orderId ? `/orders/${orderId}` : "/orders",
          eventType: event.eventType,
        });
        toastSuccess("Order Ready for Pickup!", "Head to the stall counter with your pickup pass.");
        break;
      }

      case "SUBORDER_COLLECTED": {
        addNotification({
          category: "ORDER",
          title: "Order Collected",
          message: `Sub-order ${orderNum ? `#${orderNum}` : ""} has been collected. Enjoy your meal!`,
          orderId,
          subOrderId,
          actionUrl: orderId ? `/orders/${orderId}` : "/orders",
          eventType: event.eventType,
        });
        toastInfo("Order Collected", "Meal collected successfully.");
        break;
      }

      case "SUBORDER_REJECTED": {
        const reason = (p.reason as string) || "Station unavailable";
        addNotification({
          category: "ORDER",
          title: "Sub-Order Notice",
          message: `Sub-order ${orderNum ? `#${orderNum}` : ""} was declined: ${reason}`,
          orderId,
          subOrderId,
          actionUrl: orderId ? `/orders/${orderId}` : "/orders",
          eventType: event.eventType,
        });
        toastWarning("Sub-Order Update", `Stall declined sub-order: ${reason}`);
        break;
      }

      case "PICKUP_GRACE_WARNING": {
        addNotification({
          category: "OPERATIONAL",
          title: "Pickup Grace Ending Soon",
          message: `Only 5 minutes left to collect sub-order ${orderNum ? `#${orderNum}` : ""} before expiry.`,
          orderId,
          subOrderId,
          actionUrl: orderId ? `/orders/${orderId}` : "/orders",
          eventType: event.eventType,
        });
        toastWarning("Pickup Warning", "5 minutes remaining before pickup grace period expires.");
        break;
      }

      case "PICKUP_GRACE_EXPIRED": {
        addNotification({
          category: "OPERATIONAL",
          title: "Pickup Window Expired",
          message: `Scheduled pickup grace expired for sub-order ${orderNum ? `#${orderNum}` : ""}.`,
          orderId,
          subOrderId,
          actionUrl: orderId ? `/orders/${orderId}` : "/orders",
          eventType: event.eventType,
        });
        toastError("Pickup Window Expired", "Order grace period elapsed.");
        break;
      }

      case "BALANCE_PAYMENT_CONFIRMED": {
        addNotification({
          category: "PAYMENT",
          title: "Balance Payment Settled",
          message: `Remaining balance for ${orderNum ? `#${orderNum}` : ""} was settled successfully.`,
          orderId,
          subOrderId,
          actionUrl: orderId ? `/orders/${orderId}` : "/orders",
          eventType: event.eventType,
        });
        toastSuccess("Balance Settled", "Remaining balance received.");
        break;
      }

      case "REFUND_PROCESSED": {
        addNotification({
          category: "PAYMENT",
          title: "Refund Processed",
          message: `Refund of ₹${Number(p.refundAmount || 0).toFixed(2)} processed for sub-order ${orderNum ? `#${orderNum}` : ""}.`,
          orderId,
          subOrderId,
          actionUrl: orderId ? `/orders/${orderId}` : "/orders",
          eventType: event.eventType,
        });
        toastInfo("Refund Processed", `Refund of ₹${Number(p.refundAmount || 0).toFixed(2)} issued.`);
        break;
      }

      default:
        break;
    }
  });

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        clearAll,
        addNotification,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within a NotificationsProvider");
  }
  return ctx;
}
