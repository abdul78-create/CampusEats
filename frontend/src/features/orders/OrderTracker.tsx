"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Clock,
  Store,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  RefreshCw,
  CreditCard,
  ChefHat,
  PackageCheck,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/api/client";
import { toastSuccess, toastError } from "@/lib/api/errors";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { OrderStatusBadge, SubOrderStatusBadge } from "@/components/ui/StatusBadge";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { useRealtime, useRealtimeSubscription } from "@/features/realtime/useRealtime";
import type { MasterOrder, SubOrder, SubOrderStatus } from "@/types/api";

const PROGRESS_STEPS: { status: SubOrderStatus; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { status: "CONFIRMED", label: "Confirmed", icon: ShieldCheck },
  { status: "PREPARING", label: "Preparing", icon: ChefHat },
  { status: "READY", label: "Ready for Pickup", icon: PackageCheck },
  { status: "COLLECTED", label: "Collected", icon: CheckCircle2 },
];

function getStepIndex(status: SubOrderStatus): number {
  switch (status) {
    case "PENDING_ACCEPTANCE":
      return 0;
    case "CONFIRMED":
      return 0;
    case "PREPARING":
      return 1;
    case "READY":
      return 2;
    case "COLLECTED":
      return 3;
    case "REJECTED":
    case "CANCELLED":
    case "REFUND_PENDING":
    case "REFUNDED":
    case "EXPIRED_UNCOLLECTED":
      return -1;
    default:
      return 0;
  }
}

function calculateCountdown(targetIso?: string | null): { text: string; isPast: boolean; minutesLeft: number } {
  if (!targetIso) return { text: "Standard Prep", isPast: false, minutesLeft: 0 };
  const target = new Date(targetIso).getTime();
  const diff = target - Date.now();
  if (diff <= 0) {
    const pastMin = Math.floor(Math.abs(diff) / 60000);
    return { text: pastMin > 0 ? `${pastMin}m ago` : "Due now", isPast: true, minutesLeft: 0 };
  }
  const min = Math.floor(diff / 60000);
  const sec = Math.floor((diff % 60000) / 1000);
  return { text: `${min}m ${sec}s`, isPast: false, minutesLeft: min };
}

export function OrderTracker({ orderId }: { orderId: string }) {
  const router = useRouter();
  const { status: realtimeStatus } = useRealtime();
  const [payingSubOrderId, setPayingSubOrderId] = useState<string | null>(null);

  // Authoritative REST query for current order state
  const {
    data: order,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<MasterOrder>({
    queryKey: ["order", orderId],
    queryFn: () => apiGet<MasterOrder>(`/orders/${orderId}`),
    refetchInterval: realtimeStatus === "CONNECTED" ? false : 5000,
  });

  // Re-fetch instantly when any realtime order event occurs
  useRealtimeSubscription("*", (ev) => {
    if (
      ev.aggregateId === orderId ||
      (ev.payload && typeof ev.payload === "object" && "masterOrderId" in ev.payload && ev.payload.masterOrderId === orderId)
    ) {
      refetch();
    }
  });

  // Countdown timer clock tick
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const handlePayBalanceOnline = async (subOrderId: string) => {
    setPayingSubOrderId(subOrderId);
    try {
      const res = await apiPost<{ upiIntent?: string; paymentId: string }>(
        "/payments/balance/online",
        {
          subOrderId,
          idempotencyKey: crypto.randomUUID(),
        }
      );
      toastSuccess("Balance payment initiated", "Opening payment session...");
      if (res.upiIntent) {
        window.open(res.upiIntent, "_blank");
      }
      refetch();
    } catch (err) {
      toastError(err, "Failed to initiate online balance payment");
    } finally {
      setPayingSubOrderId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-6 w-32 bg-[var(--neutral-200)] dark:bg-[var(--neutral-800)] rounded-lg animate-pulse" />
          <div className="h-6 w-24 bg-[var(--neutral-200)] dark:bg-[var(--neutral-800)] rounded-lg animate-pulse" />
        </div>
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-[var(--danger-bg)] text-[var(--danger)] flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-[var(--text-primary)]">
          Could not load order
        </h2>
        <p className="text-xs text-[var(--text-secondary)]">
          {(error as Error)?.message || "Order does not exist or you lack permission."}
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" onClick={() => router.push("/orders")}>
            Back to Orders
          </Button>
          <Button variant="primary" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Top Bar: Back & Realtime Status */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/orders"
          className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>All Orders</span>
        </Link>

        {/* Realtime Connection Indicator */}
        <div className="flex items-center gap-2">
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
              realtimeStatus === "CONNECTED"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                : realtimeStatus === "RECONNECTING"
                ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
                : "bg-[var(--neutral-100)] border-[var(--border-subtle)] text-[var(--text-tertiary)]"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                realtimeStatus === "CONNECTED"
                  ? "bg-emerald-500 animate-pulse"
                  : realtimeStatus === "RECONNECTING"
                  ? "bg-amber-500 animate-ping"
                  : "bg-neutral-400"
              }`}
            />
            <span>
              {realtimeStatus === "CONNECTED"
                ? "Live Updates"
                : realtimeStatus === "RECONNECTING"
                ? "Reconnecting..."
                : "Offline"}
            </span>
          </div>

          <button
            type="button"
            onClick={() => refetch()}
            aria-label="Refresh order data"
            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--neutral-100)] dark:hover:bg-[var(--neutral-800)] transition-colors"
            title="Refresh order"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Master Order Overview Card */}
      <Card className="border-[var(--border-default)] shadow-sm overflow-hidden">
        <CardHeader className="bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                Master Order
              </div>
              <div className="text-xl sm:text-2xl font-black text-[var(--text-primary)] tracking-tight">
                #{order.id.slice(0, 8).toUpperCase()}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <OrderStatusBadge status={order.status} />
              <div className="text-right">
                <div className="text-xs text-[var(--text-tertiary)]">Total Amount</div>
                <div className="text-lg font-black text-[var(--text-primary)]">
                  ₹{Number(order.totalAmount || 0).toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </CardHeader>

        {/* Advance vs Counter Balance Strip */}
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-subtle)] text-xs">
            <div>
              <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold">Advance Paid</span>
              <p className="font-bold text-emerald-600 dark:text-emerald-400 text-sm mt-0.5">
                ₹{Number(order.advanceAmount || 0).toFixed(2)} ({order.advancePercentage || 50}%)
              </p>
            </div>
            <div>
              <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold">Counter Balance</span>
              <p className="font-bold text-[var(--text-primary)] text-sm mt-0.5">
                ₹{Number(order.remainingAmount || 0).toFixed(2)}
              </p>
            </div>
            <div>
              <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold">Order Placed</span>
              <p className="font-medium text-[var(--text-secondary)] text-xs mt-0.5">
                {order.createdAt ? new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Recently"}
              </p>
            </div>
            <div>
              <span className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold">Stall Count</span>
              <p className="font-bold text-[var(--text-primary)] text-sm mt-0.5">
                {order.subOrders?.length || 1} Station{order.subOrders?.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sub-Orders Section (One per Kitchen Station) */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
            <ChefHat className="w-4 h-4 text-[var(--accent)]" />
            <span>Kitchen Sub-Orders & Live Tracking</span>
          </h3>
          <span className="text-xs text-[var(--text-secondary)]">
            Independent station queues
          </span>
        </div>

        {order.subOrders && order.subOrders.length > 0 ? (
          order.subOrders.map((sub: SubOrder) => {
            const stepIdx = getStepIndex(sub.status);
            const isTerminalNegative = ["REJECTED", "CANCELLED", "REFUNDED", "EXPIRED_UNCOLLECTED"].includes(sub.status);
            const countdown = calculateCountdown(sub.scheduledPickupTime);

            return (
              <Card
                key={sub.id}
                className="border-[var(--border-subtle)] hover:border-[var(--border-default)] transition-all overflow-hidden"
              >
                {/* Stall Header */}
                <div className="p-4 sm:p-5 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent-text)] flex items-center justify-center font-bold">
                      <Store className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-base text-[var(--text-primary)]">
                        {sub.stallName || "Campus Kitchen"}
                      </h4>
                      <p className="text-[11px] text-[var(--text-tertiary)]">
                        Sub-Order #{sub.id.slice(0, 8).toUpperCase()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <SubOrderStatusBadge status={sub.status} />
                  </div>
                </div>

                {/* Live Progress Pipeline Stepper */}
                {!isTerminalNegative ? (
                  <div className="p-5 sm:p-6 border-b border-[var(--border-subtle)] bg-[var(--bg-base)]">
                    <div className="relative">
                      {/* Background connecting track */}
                      <div className="absolute top-4 left-4 right-4 h-1 bg-[var(--border-subtle)] rounded-full -z-0" />
                      {/* Active progress fill */}
                      <motion.div
                        className="absolute top-4 left-4 h-1 bg-[var(--accent)] rounded-full -z-0"
                        initial={false}
                        animate={{
                          width: `${Math.max(0, Math.min(100, (stepIdx / (PROGRESS_STEPS.length - 1)) * 100))}%`,
                        }}
                        transition={{ type: "spring", stiffness: 100, damping: 20 }}
                      />

                      {/* Stepper Nodes */}
                      <div className="flex justify-between items-start relative z-10">
                        {PROGRESS_STEPS.map((step, idx) => {
                          const Icon = step.icon;
                          const isDone = idx < stepIdx;
                          const isCurrent = idx === stepIdx;

                          return (
                            <div key={step.status} className="flex flex-col items-center text-center max-w-[80px]">
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200 ${
                                  isDone
                                    ? "bg-emerald-500 text-white shadow-xs"
                                    : isCurrent
                                    ? "bg-[var(--accent)] text-white ring-4 ring-[var(--accent-subtle)] scale-110 shadow-sm"
                                    : "bg-[var(--bg-surface)] border border-[var(--border-default)] text-[var(--text-tertiary)]"
                                }`}
                              >
                                <Icon className="w-4 h-4" />
                              </div>
                              <span
                                className={`mt-2 text-[10px] sm:text-[11px] font-semibold leading-tight ${
                                  isCurrent
                                    ? "text-[var(--accent-text)] font-bold"
                                    : isDone
                                    ? "text-[var(--text-primary)]"
                                    : "text-[var(--text-tertiary)]"
                                }`}
                              >
                                {step.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-[var(--danger-bg)] border-b border-[var(--border-subtle)] flex items-center gap-3 text-xs text-[var(--danger)] font-medium">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>
                      {sub.status === "REJECTED"
                        ? "Station was unable to fulfill this sub-order. Isolated refund has been triggered."
                        : sub.status === "EXPIRED_UNCOLLECTED"
                        ? "The pickup grace window elapsed before collection."
                        : "Sub-order status: " + sub.status}
                    </span>
                  </div>
                )}

                {/* Sub-Order Details & Ready Callouts */}
                <div className="p-4 sm:p-5 space-y-4">
                  {/* READY Callout Banner */}
                  {sub.status === "READY" && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2"
                    >
                      <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold text-sm">
                        <PackageCheck className="w-5 h-5 text-emerald-500" />
                        <span>Ready for Counter Collection!</span>
                      </div>
                      <p className="text-xs text-emerald-800 dark:text-emerald-200/90 leading-relaxed">
                        Please walk to <strong className="font-bold">{sub.stallName}</strong> counter and present Sub-Order code:{" "}
                        <strong className="font-mono text-sm underline">#{sub.id.slice(0, 6).toUpperCase()}</strong>.
                      </p>
                    </motion.div>
                  )}

                  {/* Scheduled Pickup Time & Countdown */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] text-xs">
                    <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                      <Clock className="w-4 h-4 text-[var(--accent)]" />
                      <span>Scheduled Pickup:</span>
                      <strong className="text-[var(--text-primary)] font-bold">
                        {sub.scheduledPickupTime
                          ? new Date(sub.scheduledPickupTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : "Immediate (~15m)"}
                      </strong>
                    </div>

                    {!isTerminalNegative && sub.status !== "COLLECTED" && (
                      <div className="flex items-center gap-1.5 font-semibold text-xs">
                        <Timer className="w-3.5 h-3.5 text-[var(--accent)]" />
                        <span className={countdown.isPast ? "text-amber-600 font-bold" : "text-[var(--text-primary)]"}>
                          {countdown.text}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Ordered Items */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                      Prepared Items
                    </div>
                    <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-subtle)] rounded-xl overflow-hidden">
                      {sub.items?.map((item) => (
                        <div
                          key={item.menuItemId}
                          className="p-3 flex items-center justify-between text-xs bg-[var(--bg-surface)]"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-md bg-[var(--accent-subtle)] text-[var(--accent-text)] flex items-center justify-center font-bold text-[11px]">
                              {item.quantity}×
                            </span>
                            <span className="font-medium text-[var(--text-primary)]">
                              {item.name}
                            </span>
                          </div>
                          <span className="font-bold text-[var(--text-secondary)]">
                            ₹{Number(item.subtotal || item.unitPrice * item.quantity || 0).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Financial Settlement for this Sub-Order */}
                  <div className="pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="space-x-3 text-[var(--text-secondary)]">
                      <span>
                        Advance Paid: <strong className="text-emerald-600 dark:text-emerald-400 font-bold">₹{Number(sub.advancePaid || 0).toFixed(2)}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Balance Due: <strong className="text-[var(--text-primary)] font-bold">₹{Number(sub.balanceDue || 0).toFixed(2)}</strong>
                      </span>
                    </div>

                    {/* Counter Balance Settlement Action */}
                    {Number(sub.balanceDue || 0) > 0 && sub.status === "READY" && (
                      <Button
                        size="sm"
                        variant="primary"
                        loading={payingSubOrderId === sub.id}
                        leftIcon={<CreditCard className="w-3.5 h-3.5" />}
                        onClick={() => handlePayBalanceOnline(sub.id)}
                      >
                        Pay Balance Online (₹{Number(sub.balanceDue).toFixed(2)})
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })
        ) : (
          <div className="p-8 text-center text-xs text-[var(--text-secondary)]">
            No station sub-orders found for this order.
          </div>
        )}
      </div>
    </div>
  );
}
