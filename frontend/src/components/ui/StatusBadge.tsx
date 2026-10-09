import React from "react";
import { Badge, type BadgeVariant } from "./Badge";
import type {
  SubOrderStatus,
  MasterOrderStatus,
  VerificationStatus,
  StudentAccountStatus,
  PaymentStatus,
  StallStatus,
} from "@/types/api";

// ─── Order Status Badge ───────────────────────────────────────────────────────

export type AnyOrderStatus = SubOrderStatus | MasterOrderStatus;

interface OrderStatusBadgeProps {
  status: AnyOrderStatus;
  className?: string;
  size?: "sm" | "md";
}

const ORDER_STATUS_CONFIG: Record<
  AnyOrderStatus,
  { label: string; variant: BadgeVariant; pulseDot?: boolean }
> = {
  PENDING_PAYMENT: { label: "Payment Pending", variant: "warning" },
  PAYMENT_FAILED: { label: "Payment Failed", variant: "danger" },
  PENDING_ACCEPTANCE: { label: "Pending Acceptance", variant: "warning", pulseDot: true },
  CONFIRMED: { label: "Confirmed", variant: "info" },
  PREPARING: { label: "Preparing", variant: "warning", pulseDot: true },
  READY: { label: "Ready for Pickup", variant: "success", pulseDot: true },
  COLLECTED: { label: "Collected", variant: "neutral" },
  FULFILLED: { label: "Fulfilled", variant: "success" },
  REJECTED: { label: "Rejected", variant: "danger" },
  CANCELLED: { label: "Cancelled", variant: "neutral" },
  REFUND_PENDING: { label: "Refund Pending", variant: "warning" },
  REFUNDED: { label: "Refunded", variant: "neutral" },
  EXPIRED_UNCOLLECTED: { label: "Uncollected Expired", variant: "danger" },
  PARTIALLY_FULFILLED: { label: "Partially Fulfilled", variant: "warning" },
};

export function OrderStatusBadge({
  status,
  className,
  size = "sm",
}: OrderStatusBadgeProps) {
  const config = ORDER_STATUS_CONFIG[status] ?? {
    label: status,
    variant: "neutral" as BadgeVariant,
  };

  return (
    <Badge
      variant={config.variant}
      size={size}
      dot
      pulseDot={config.pulseDot}
      className={className}
    >
      {config.label}
    </Badge>
  );
}

export const SubOrderStatusBadge = OrderStatusBadge;

// ─── Verification Status Badge ────────────────────────────────────────────────

export type AnyVerificationStatus = VerificationStatus | StudentAccountStatus;

interface VerificationStatusBadgeProps {
  status: AnyVerificationStatus;
  className?: string;
  size?: "sm" | "md";
}

const VERIFICATION_STATUS_CONFIG: Record<
  AnyVerificationStatus,
  { label: string; variant: BadgeVariant; pulseDot?: boolean }
> = {
  ACTIVE: { label: "Verified Active", variant: "success" },
  PENDING_SUBMISSION: { label: "Pending Submission", variant: "neutral" },
  UNDER_REVIEW: { label: "Under Review", variant: "warning", pulseDot: true },
  PENDING_VERIFICATION: {
    label: "Pending Verification",
    variant: "warning",
    pulseDot: true,
  },
  REJECTED: { label: "Verification Rejected", variant: "danger" },
  SUSPENDED: { label: "Suspended", variant: "danger" },
};

export function VerificationStatusBadge({
  status,
  className,
  size = "sm",
}: VerificationStatusBadgeProps) {
  const config = VERIFICATION_STATUS_CONFIG[status] ?? {
    label: status,
    variant: "neutral" as BadgeVariant,
  };

  return (
    <Badge
      variant={config.variant}
      size={size}
      dot
      pulseDot={config.pulseDot}
      className={className}
    >
      {config.label}
    </Badge>
  );
}

// ─── Payment Status Badge ─────────────────────────────────────────────────────

interface PaymentStatusBadgeProps {
  status: PaymentStatus;
  className?: string;
  size?: "sm" | "md";
}

const PAYMENT_STATUS_CONFIG: Record<
  PaymentStatus,
  { label: string; variant: BadgeVariant; pulseDot?: boolean }
> = {
  INITIATED: { label: "Payment Initiated", variant: "info", pulseDot: true },
  SUCCESS: { label: "Paid", variant: "success" },
  FAILED: { label: "Payment Failed", variant: "danger" },
  EXPIRED: { label: "Payment Expired", variant: "neutral" },
};

export function PaymentStatusBadge({
  status,
  className,
  size = "sm",
}: PaymentStatusBadgeProps) {
  const config = PAYMENT_STATUS_CONFIG[status] ?? {
    label: status,
    variant: "neutral" as BadgeVariant,
  };

  return (
    <Badge
      variant={config.variant}
      size={size}
      dot
      pulseDot={config.pulseDot}
      className={className}
    >
      {config.label}
    </Badge>
  );
}

// ─── Stall Status Badge ───────────────────────────────────────────────────────

interface StallStatusBadgeProps {
  status: StallStatus;
  className?: string;
  size?: "sm" | "md";
}

const STALL_STATUS_CONFIG: Record<
  StallStatus,
  { label: string; variant: BadgeVariant; pulseDot?: boolean }
> = {
  OPEN: { label: "Open Now", variant: "success" },
  CLOSED: { label: "Closed", variant: "neutral" },
  BUSY: { label: "Kitchen Busy", variant: "warning", pulseDot: true },
  TEMPORARILY_PAUSED: { label: "Temporarily Paused", variant: "warning" },
};

export function StallStatusBadge({
  status,
  className,
  size = "sm",
}: StallStatusBadgeProps) {
  const config = STALL_STATUS_CONFIG[status] ?? {
    label: status,
    variant: "neutral" as BadgeVariant,
  };

  return (
    <Badge
      variant={config.variant}
      size={size}
      dot
      pulseDot={config.pulseDot}
      className={className}
    >
      {config.label}
    </Badge>
  );
}
