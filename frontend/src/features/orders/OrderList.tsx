"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Package, Search, Utensils, RefreshCw } from "lucide-react";
import { apiGet } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { OrderCard } from "./OrderCard";
import { useRealtime, useRealtimeSubscription } from "@/features/realtime/useRealtime";
import type { MasterOrder } from "@/types/api";

interface OrdersApiResponse {
  data: MasterOrder[];
  meta?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function OrderList() {
  const [tab, setTab] = useState<"ACTIVE" | "ALL" | "PAST">("ACTIVE");
  const [searchTerm, setSearchTerm] = useState("");
  const { status: realtimeStatus } = useRealtime();

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery<MasterOrder[]>({
    queryKey: ["orders"],
    queryFn: async () => {
      // Backend returns either { data: MasterOrder[] } or MasterOrder[] directly
      const res = await apiGet<OrdersApiResponse | MasterOrder[]>("/orders");
      if (Array.isArray(res)) return res;
      if (res && Array.isArray(res.data)) return res.data;
      return [];
    },
    refetchInterval: realtimeStatus === "CONNECTED" ? false : 8000,
  });

  // Re-fetch orders instantly on any realtime event
  useRealtimeSubscription("*", () => {
    refetch();
  });

  const orders = useMemo(() => data || [], [data]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Tab filter
      const isActive = ["PENDING_PAYMENT", "CONFIRMED", "PARTIALLY_FULFILLED"].includes(
        order.status
      );

      if (tab === "ACTIVE" && !isActive) return false;
      if (tab === "PAST" && isActive) return false;

      // Search term filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesId = order.id.toLowerCase().includes(term);
        const matchesStalls = order.subOrders?.some((so) =>
          so.stallName?.toLowerCase().includes(term)
        );
        return matchesId || matchesStalls;
      }

      return true;
    });
  }, [orders, tab, searchTerm]);

  const activeCount = useMemo(() => {
    return orders.filter((o) =>
      ["PENDING_PAYMENT", "CONFIRMED", "PARTIALLY_FULFILLED"].includes(o.status)
    ).length;
  }, [orders]);

  return (
    <div className="space-y-6">
      {/* Top Controls: Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] self-start">
          <button
            type="button"
            onClick={() => setTab("ACTIVE")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              tab === "ACTIVE"
                ? "bg-[var(--accent)] text-white shadow-xs"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Active Orders {activeCount > 0 && `(${activeCount})`}
          </button>
          <button
            type="button"
            onClick={() => setTab("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              tab === "ALL"
                ? "bg-[var(--accent)] text-white shadow-xs"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            All Orders ({orders.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("PAST")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              tab === "PAST"
                ? "bg-[var(--accent)] text-white shadow-xs"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Past History
          </button>
        </div>

        {/* Search Input & Refresh */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
            <input
              type="text"
              placeholder="Search by order or stall..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>

          <button
            type="button"
            onClick={() => refetch()}
            className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--neutral-100)] dark:hover:bg-[var(--neutral-800)] transition-colors border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
            title="Refresh orders"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Orders List */}
      {isLoading ? (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : isError ? (
        <div className="p-8 text-center rounded-2xl bg-[var(--danger-bg)] border border-[var(--border-subtle)] text-xs text-[var(--danger)] space-y-2">
          <p className="font-bold">Failed to load orders.</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[var(--accent-subtle)] text-[var(--accent-text)] flex items-center justify-center mx-auto">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <h4 className="font-bold text-sm text-[var(--text-primary)]">
              {tab === "ACTIVE"
                ? "No active orders right now"
                : "No orders found"}
            </h4>
            <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-sm mx-auto">
              {tab === "ACTIVE"
                ? "When you order meals and advance deposits are confirmed, active preparation progress will appear here in real time."
                : "Browse campus stalls and pre-order meals to skip queue lines."}
            </p>
          </div>
          <div className="pt-2">
            <Link href="/stalls">
              <Button size="sm" variant="primary" leftIcon={<Utensils className="w-4 h-4" />}>
                Explore Campus Stalls
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredOrders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}
