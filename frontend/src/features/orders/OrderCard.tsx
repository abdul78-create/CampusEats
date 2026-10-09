"use client";

import React from "react";
import Link from "next/link";
import { Store, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { OrderStatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import type { MasterOrder } from "@/types/api";

interface OrderCardProps {
  order: MasterOrder;
}

export function OrderCard({ order }: OrderCardProps) {
  const isActive = ["PENDING_PAYMENT", "CONFIRMED", "PARTIALLY_FULFILLED"].includes(
    order.status
  );

  return (
    <Card className="hover:border-[var(--border-default)] transition-all overflow-hidden border-[var(--border-subtle)]">
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Order Info */}
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-sm text-[var(--text-primary)]">
              #{order.id.slice(0, 8).toUpperCase()}
            </span>
            <OrderStatusBadge status={order.status} />
            {isActive && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active
              </span>
            )}
          </div>

          {/* Stalls summary */}
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <Store className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <span className="truncate">
              {order.subOrders && order.subOrders.length > 0
                ? order.subOrders.map((so) => so.stallName || "Kitchen").join(", ")
                : "Campus Stalls"}
            </span>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-[var(--text-tertiary)]">
            <span>
              {order.createdAt
                ? new Date(order.createdAt).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "Recent"}
            </span>
            <span>•</span>
            <span>
              {order.subOrders?.length || 1} Station
              {order.subOrders?.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        {/* Pricing & CTA */}
        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--border-subtle)]">
          <div className="text-left sm:text-right">
            <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold">
              Total (Advance {order.advancePercentage || 50}%)
            </div>
            <div className="text-base font-black text-[var(--text-primary)]">
              ₹{Number(order.totalAmount || 0).toFixed(2)}
            </div>
          </div>

          <Link href={`/orders/${order.id}`}>
            <Button
              size="sm"
              variant={isActive ? "primary" : "outline"}
              rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
            >
              {isActive ? "Track Live" : "View Details"}
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}
