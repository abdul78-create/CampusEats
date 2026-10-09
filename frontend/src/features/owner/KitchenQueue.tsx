"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ChefHat,
  Clock,
  CheckCircle2,
  Ban,
  RefreshCw,
  Search,
  PackageCheck,
  Banknote,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/api/client";
import { toastSuccess, toastError } from "@/lib/api/errors";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SubOrderStatusBadge } from "@/components/ui/StatusBadge";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/Dialog";
import { useRealtimeSubscription } from "@/features/realtime/useRealtime";
import type { OwnerSubOrder } from "./ownerTypes";

export function KitchenQueue() {
  const [tab, setTab] = useState<"ACTIVE" | "PREPARING" | "READY" | "COMPLETED" | "ALL">("ACTIVE");
  const [searchTerm, setSearchTerm] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Reject modal state
  const [rejectingOrder, setRejectingOrder] = useState<OwnerSubOrder | null>(null);
  const [rejectReason, setRejectReason] = useState("Station capacity exceeded");

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery<OwnerSubOrder[]>({
    queryKey: ["owner-orders"],
    queryFn: () => apiGet<OwnerSubOrder[]>("/owner/orders"),
    refetchInterval: 5000,
  });

  // Re-fetch on any incoming realtime event
  useRealtimeSubscription("*", () => {
    refetch();
  });

  const orders = useMemo(() => data || [], [data]);

  const handlePrepare = async (orderId: string) => {
    setActionLoadingId(orderId);
    try {
      await apiPost(`/sub-orders/${orderId}/prepare`);
      toastSuccess("Cooking started", "Order moved to IN PREPARATION queue.");
      refetch();
    } catch (err) {
      toastError(err, "Failed to start preparation");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleMarkReady = async (orderId: string) => {
    setActionLoadingId(orderId);
    try {
      await apiPost(`/sub-orders/${orderId}/ready`);
      toastSuccess("Order Ready!", "Customer notified to collect meal at counter.");
      refetch();
    } catch (err) {
      toastError(err, "Failed to mark order ready");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCollect = async (orderId: string) => {
    setActionLoadingId(orderId);
    try {
      await apiPost(`/sub-orders/${orderId}/collect`);
      toastSuccess("Order Collected", "Meal handed over successfully.");
      refetch();
    } catch (err) {
      toastError(err, "Failed to mark order collected");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCounterSettlement = async (orderId: string) => {
    setActionLoadingId(orderId);
    try {
      await apiPost(`/sub-orders/${orderId}/counter-settlement`, {
        paymentMethod: "COUNTER_CASH",
      });
      toastSuccess("Cash Recorded", "Counter balance marked as settled.");
      refetch();
    } catch (err) {
      toastError(err, "Failed to record cash settlement");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingOrder) return;
    setActionLoadingId(rejectingOrder.id);
    try {
      await apiPost(`/sub-orders/${rejectingOrder.id}/reject`, {
        reason: rejectReason,
      });
      toastSuccess("Sub-Order Declined", "Isolated refund triggered for student.");
      setRejectingOrder(null);
      refetch();
    } catch (err) {
      toastError(err, "Failed to decline order");
    } finally {
      setActionLoadingId(null);
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Tab filter
      if (tab === "ACTIVE" && !["CONFIRMED", "PREPARING", "READY"].includes(order.status)) {
        return false;
      }
      if (tab === "PREPARING" && order.status !== "PREPARING") {
        return false;
      }
      if (tab === "READY" && order.status !== "READY") {
        return false;
      }
      if (tab === "COMPLETED" && order.status !== "COLLECTED") {
        return false;
      }

      // Search filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesSub = order.subOrderNumber?.toLowerCase().includes(term);
        const matchesMaster = order.masterOrderNumber?.toLowerCase().includes(term);
        const matchesItem = order.items?.some((it) => it.name.toLowerCase().includes(term));
        return matchesSub || matchesMaster || matchesItem;
      }

      return true;
    });
  }, [orders, tab, searchTerm]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] tracking-tight">
              Kitchen Orders Queue
            </h1>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" title="Live Queue Active" />
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Real-time kitchen line coordination, preparation advancement, and counter cash collection.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/owner">
            <Button size="sm" variant="outline">
              ← Dashboard
            </Button>
          </Link>
          <button
            type="button"
            onClick={() => refetch()}
            className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--neutral-100)] dark:hover:bg-[var(--neutral-800)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] transition-colors"
            title="Refresh queue"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Queue Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => setTab("ACTIVE")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              tab === "ACTIVE"
                ? "bg-[var(--accent)] text-white shadow-xs"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Active Work ({orders.filter((o) => ["CONFIRMED", "PREPARING", "READY"].includes(o.status)).length})
          </button>
          <button
            type="button"
            onClick={() => setTab("PREPARING")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              tab === "PREPARING"
                ? "bg-[var(--accent)] text-white shadow-xs"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Cooking ({orders.filter((o) => o.status === "PREPARING").length})
          </button>
          <button
            type="button"
            onClick={() => setTab("READY")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              tab === "READY"
                ? "bg-[var(--accent)] text-white shadow-xs"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Ready for Pickup ({orders.filter((o) => o.status === "READY").length})
          </button>
          <button
            type="button"
            onClick={() => setTab("COMPLETED")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              tab === "COMPLETED"
                ? "bg-[var(--accent)] text-white shadow-xs"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Collected
          </button>
          <button
            type="button"
            onClick={() => setTab("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              tab === "ALL"
                ? "bg-[var(--accent)] text-white shadow-xs"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            All History
          </button>
        </div>

        <div className="relative sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
          <input
            type="text"
            placeholder="Search order # or meal..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
      </div>

      {/* Orders Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : isError ? (
        <div className="p-8 text-center rounded-2xl bg-[var(--danger-bg)] border border-[var(--border-subtle)] text-xs text-[var(--danger)] space-y-2">
          <p className="font-bold">Failed to load kitchen queue.</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="p-16 text-center rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-2">
          <ChefHat className="w-8 h-8 text-[var(--text-tertiary)] mx-auto" />
          <h4 className="font-bold text-sm text-[var(--text-primary)]">
            No orders in this queue
          </h4>
          <p className="text-xs text-[var(--text-secondary)]">
            Incoming orders will appear automatically via live event streams.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredOrders.map((order) => {
            const isLoadingAction = actionLoadingId === order.id;

            return (
              <Card
                key={order.id}
                className="border-[var(--border-subtle)] hover:border-[var(--border-default)] transition-all flex flex-col justify-between overflow-hidden"
              >
                <div>
                  {/* Card Header */}
                  <div className="p-4 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] flex items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-[var(--text-primary)]">
                          #{order.subOrderNumber || order.id.slice(0, 8).toUpperCase()}
                        </span>
                        <SubOrderStatusBadge status={order.status} />
                      </div>
                      <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                        Master: #{order.masterOrderNumber || "—"}
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] text-[var(--text-tertiary)]">Total Amount</div>
                      <div className="font-bold text-sm text-[var(--text-primary)]">
                        ₹{Number(order.totalAmount || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Scheduled Pickup Time */}
                  <div className="p-3 bg-[var(--bg-base)] border-b border-[var(--border-subtle)] flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                      <Clock className="w-3.5 h-3.5 text-[var(--accent)]" />
                      <span>Pickup Target:</span>
                      <strong className="text-[var(--text-primary)] font-bold">
                        {order.pickupSchedule?.scheduledPickupTime
                          ? new Date(order.pickupSchedule.scheduledPickupTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                          : "Immediate"}
                      </strong>
                    </div>

                    {order.pickupSchedule?.preparationTimeMinutes && (
                      <span className="text-[11px] text-[var(--text-tertiary)]">
                        Est. {order.pickupSchedule.preparationTimeMinutes} min prep
                      </span>
                    )}
                  </div>

                  {/* Meal Items to Prepare */}
                  <div className="p-4 space-y-2">
                    <div className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">
                      Meal Items
                    </div>
                    <div className="space-y-1 divide-y divide-[var(--border-subtle)]">
                      {order.items?.map((it) => (
                        <div
                          key={it.id}
                          className="pt-1.5 pb-1 flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-md bg-[var(--accent-subtle)] text-[var(--accent-text)] font-bold text-[11px] flex items-center justify-center">
                              {it.quantity}×
                            </span>
                            <span className="font-semibold text-[var(--text-primary)]">
                              {it.name}
                            </span>
                          </div>
                          <span className="font-medium text-[var(--text-secondary)]">
                            ₹{Number(it.total || 0).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card Actions & Balance Section */}
                <div className="p-4 bg-[var(--bg-surface)] border-t border-[var(--border-subtle)] space-y-3">
                  {/* Ledger Balance Information */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-secondary)]">
                      Advance: <strong className="text-emerald-600 font-bold">₹{Number(order.advancePaidAmount || 0).toFixed(2)}</strong>
                    </span>
                    <span className="text-[var(--text-secondary)]">
                      Balance:{" "}
                      <strong
                        className={`font-bold ${
                          order.isBalancePaid || Number(order.remainingBalanceAmount || 0) === 0
                            ? "text-emerald-600"
                            : "text-[var(--accent)]"
                        }`}
                      >
                        {order.isBalancePaid || Number(order.remainingBalanceAmount || 0) === 0
                          ? "Fully Settled"
                          : `₹${Number(order.remainingBalanceAmount).toFixed(2)}`}
                      </strong>
                    </span>
                  </div>

                  {/* Operational Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {order.status === "CONFIRMED" && (
                      <>
                        <Button
                          size="sm"
                          variant="primary"
                          className="flex-1 justify-center"
                          loading={isLoadingAction}
                          leftIcon={<ChefHat className="w-3.5 h-3.5" />}
                          onClick={() => handlePrepare(order.id)}
                        >
                          Start Cooking
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-[var(--danger)] hover:bg-[var(--danger-bg)]"
                          loading={isLoadingAction}
                          leftIcon={<Ban className="w-3.5 h-3.5" />}
                          onClick={() => setRejectingOrder(order)}
                        >
                          Decline
                        </Button>
                      </>
                    )}

                    {order.status === "PREPARING" && (
                      <Button
                        size="sm"
                        variant="primary"
                        className="w-full justify-center bg-emerald-600 hover:bg-emerald-700 text-white"
                        loading={isLoadingAction}
                        leftIcon={<PackageCheck className="w-3.5 h-3.5" />}
                        onClick={() => handleMarkReady(order.id)}
                      >
                        Mark as Ready for Pickup
                      </Button>
                    )}

                    {order.status === "READY" && (
                      <div className="w-full space-y-2">
                        {/* Cash Settlement Button if Balance Due */}
                        {!order.isBalancePaid && Number(order.remainingBalanceAmount || 0) > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full justify-center text-amber-600 border-amber-500/40 hover:bg-amber-500/10"
                            loading={isLoadingAction}
                            leftIcon={<Banknote className="w-3.5 h-3.5" />}
                            onClick={() => handleCounterSettlement(order.id)}
                          >
                            Collect Cash Balance (₹{Number(order.remainingBalanceAmount).toFixed(2)})
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="primary"
                          className="w-full justify-center bg-emerald-600 hover:bg-emerald-700 text-white"
                          loading={isLoadingAction}
                          leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                          onClick={() => handleCollect(order.id)}
                        >
                          Confirm Student Collection
                        </Button>
                      </div>
                    )}

                    {order.status === "COLLECTED" && (
                      <div className="w-full py-1 text-center text-xs text-emerald-600 font-bold flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Order Complete & Handed Over</span>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Decline / Reject Confirmation Dialog */}
      <Dialog open={!!rejectingOrder} onOpenChange={(open) => !open && setRejectingOrder(null)}>
        <DialogHeader>
          <DialogTitle>Decline Sub-Order</DialogTitle>
          <DialogDescription>
            Are you sure you want to decline sub-order #{rejectingOrder?.subOrderNumber}? This will trigger an isolated refund for the student.
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 space-y-2">
          <label className="text-xs font-semibold text-[var(--text-primary)]">
            Reason for Declining:
          </label>
          <select
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="w-full p-2.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            <option value="Station capacity exceeded">Station capacity exceeded</option>
            <option value="Ingredient out of stock">Ingredient out of stock</option>
            <option value="Kitchen closing early">Kitchen closing early</option>
            <option value="Equipment maintenance">Equipment maintenance</option>
          </select>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setRejectingOrder(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={!!actionLoadingId}
            onClick={handleConfirmReject}
          >
            Confirm Decline
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
