"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Store,
  ChefHat,
  UtensilsCrossed,
  Sliders,
  Clock,
  ArrowRight,
  AlertTriangle,
  ShieldAlert,
} from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api/client";
import { toastSuccess, toastError } from "@/lib/api/errors";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { StallStatusBadge, SubOrderStatusBadge } from "@/components/ui/StatusBadge";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { useRealtimeSubscription } from "@/features/realtime/useRealtime";
import type { StallStatus } from "@/types/api";
import type { OwnerStallData, OwnerSubOrder } from "./ownerTypes";

export function OwnerDashboard() {
  const queryClient = useQueryClient();
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Fetch owner stall metadata
  const {
    data: stall,
    isLoading: isLoadingStall,
    error: stallError,
    refetch: refetchStall,
  } = useQuery<OwnerStallData>({
    queryKey: ["owner-stall"],
    queryFn: () => apiGet<OwnerStallData>("/owner/stall"),
  });

  // Fetch owner active orders
  const {
    data: orders,
    isLoading: isLoadingOrders,
    refetch: refetchOrders,
  } = useQuery<OwnerSubOrder[]>({
    queryKey: ["owner-orders"],
    queryFn: () => apiGet<OwnerSubOrder[]>("/owner/orders"),
  });

  // Real-time listener: re-fetch instantly on incoming orders
  useRealtimeSubscription("*", () => {
    refetchOrders();
    refetchStall();
  });

  const handleStatusChange = async (newStatus: StallStatus) => {
    setIsUpdatingStatus(true);
    try {
      await apiPatch<{ stallId: string; currentStatus: StallStatus }>(
        "/owner/stall/status",
        { status: newStatus }
      );
      toastSuccess("Status updated", `Stall operational status set to ${newStatus}`);
      queryClient.invalidateQueries({ queryKey: ["owner-stall"] });
    } catch (err) {
      toastError(err, "Failed to update stall status");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const activeOrders = (orders || []).filter((o) =>
    ["CONFIRMED", "PREPARING", "READY"].includes(o.status)
  );

  const pendingConfirmation = (orders || []).filter((o) =>
    o.status === "CONFIRMED"
  );

  const readyForPickup = (orders || []).filter((o) =>
    o.status === "READY"
  );

  if (isLoadingStall || isLoadingOrders) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="h-10 w-48 bg-[var(--neutral-200)] dark:bg-[var(--neutral-800)] rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  if (stallError || !stall) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-[var(--danger-bg)] text-[var(--danger)] flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-[var(--text-primary)]">
          Stall Access Denied or Not Found
        </h2>
        <p className="text-xs text-[var(--text-secondary)]">
          You must be logged in as a registered Stall Owner with an active campus stall.
        </p>
        <Link href="/login">
          <Button size="sm" variant="primary">
            Sign In with Owner Credentials
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 sm:p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[var(--accent)] text-white flex items-center justify-center font-bold shadow-md shadow-[var(--brand-500)]/20 shrink-0">
            <Store className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] tracking-tight">
                {stall.name}
              </h1>
              <StallStatusBadge status={stall.liveStatus} />
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Campus Block: <strong className="text-[var(--text-primary)]">{stall.campusBlock || "Main Complex"}</strong> • Processing: <strong className="text-[var(--text-primary)]">{stall.processingMode}</strong>
            </p>
          </div>
        </div>

        {/* Live Operational Status Switcher */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)]">
          {(["OPEN", "BUSY", "TEMPORARILY_PAUSED", "CLOSED"] as const).map((st) => (
            <button
              key={st}
              type="button"
              disabled={isUpdatingStatus}
              onClick={() => handleStatusChange(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                stall.liveStatus === st
                  ? st === "OPEN"
                    ? "bg-emerald-500 text-white shadow-xs"
                    : st === "BUSY"
                    ? "bg-amber-500 text-white shadow-xs"
                    : st === "TEMPORARILY_PAUSED"
                    ? "bg-blue-500 text-white shadow-xs"
                    : "bg-neutral-600 text-white shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--neutral-200)] dark:hover:bg-[var(--neutral-700)]"
              }`}
            >
              {st === "TEMPORARILY_PAUSED" ? "PAUSED" : st}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-4 border-[var(--border-subtle)] space-y-1">
          <div className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase flex items-center justify-between">
            <span>Active Orders</span>
            <ChefHat className="w-4 h-4 text-[var(--accent)]" />
          </div>
          <div className="text-2xl font-black text-[var(--text-primary)]">
            {activeOrders.length}
          </div>
          <p className="text-[10px] text-[var(--text-secondary)]">
            {pendingConfirmation.length} to confirm • {readyForPickup.length} ready
          </p>
        </Card>

        <Card className="p-4 border-[var(--border-subtle)] space-y-1">
          <div className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase flex items-center justify-between">
            <span>Kitchen Capacity</span>
            <Sliders className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-[var(--text-primary)]">
            {stall.capacity?.parallelPreparationLimit || 3}
          </div>
          <p className="text-[10px] text-[var(--text-secondary)]">
            Parallel station cooking limit
          </p>
        </Card>

        <Card className="p-4 border-[var(--border-subtle)] space-y-1">
          <div className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase flex items-center justify-between">
            <span>Menu Items</span>
            <UtensilsCrossed className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-[var(--text-primary)]">
            {stall.menuItems?.length || 0}
          </div>
          <p className="text-[10px] text-[var(--text-secondary)]">
            {stall.menuItems?.filter((i) => i.isSoldOut).length || 0} sold out items
          </p>
        </Card>

        <Card className="p-4 border-[var(--border-subtle)] space-y-1">
          <div className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase flex items-center justify-between">
            <span>Operational Buffer</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-[var(--text-primary)]">
            {stall.capacity?.operationalBufferMinutes || 2}m
          </div>
          <p className="text-[10px] text-[var(--text-secondary)]">
            Queue delay safety buffer
          </p>
        </Card>
      </div>

      {/* Main Feature Portals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Kitchen Queue Portal Card */}
        <Card className="hover:border-[var(--border-default)] transition-all flex flex-col justify-between overflow-hidden">
          <CardHeader className="space-y-1 pb-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent-text)] flex items-center justify-center font-bold">
              <ChefHat className="w-5 h-5" />
            </div>
            <CardTitle className="text-base font-bold text-[var(--text-primary)] pt-2">
              Kitchen Orders Queue
            </CardTitle>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Accept incoming orders, signal preparation progress, mark orders ready, and record cash collections.
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            <Link href="/owner/orders">
              <Button size="sm" variant="primary" className="w-full justify-center" rightIcon={<ArrowRight className="w-4 h-4" />}>
                Open Kitchen Queue ({activeOrders.length})
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Menu & Inventory Portal Card */}
        <Card className="hover:border-[var(--border-default)] transition-all flex flex-col justify-between overflow-hidden">
          <CardHeader className="space-y-1 pb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <CardTitle className="text-base font-bold text-[var(--text-primary)] pt-2">
              Menu & Inventory
            </CardTitle>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Create and edit dishes, toggle live availability, update preparation times, and adjust stock quantities.
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            <Link href="/owner/menu">
              <Button size="sm" variant="outline" className="w-full justify-center" rightIcon={<ArrowRight className="w-4 h-4" />}>
                Manage Menu ({stall.menuItems?.length || 0})
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Capacity & Operational Settings */}
        <Card className="hover:border-[var(--border-default)] transition-all flex flex-col justify-between overflow-hidden">
          <CardHeader className="space-y-1 pb-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
              <Sliders className="w-5 h-5" />
            </div>
            <CardTitle className="text-base font-bold text-[var(--text-primary)] pt-2">
              Stall Settings & Capacity
            </CardTitle>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Configure maximum active load, parallel station lines, operating schedule, and preparation buffers.
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            <Link href="/owner/settings">
              <Button size="sm" variant="outline" className="w-full justify-center" rightIcon={<ArrowRight className="w-4 h-4" />}>
                Configure Settings
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Urgent Orders Preview */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span>Incoming Orders Requiring Action</span>
          </h3>
          <Link href="/owner/orders" className="text-xs font-semibold text-[var(--accent)] hover:underline">
            View All →
          </Link>
        </div>

        {activeOrders.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)]">
            No active orders waiting right now. Station is clear!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeOrders.slice(0, 4).map((order) => (
              <div
                key={order.id}
                className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] flex items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[var(--text-primary)]">
                      #{order.id.slice(0, 8).toUpperCase()}
                    </span>
                    <SubOrderStatusBadge status={order.status} />
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                    {order.items?.map((it) => `${it.quantity}× ${it.name}`).join(", ") || "Meals"}
                  </p>
                </div>

                <Link href="/owner/orders">
                  <Button size="sm" variant="outline">
                    Action
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
