"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Store,
  Clock,
  ArrowRight,
  Receipt,
  Sparkles,
} from "lucide-react";
import { apiGet } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/Card";
import { OrderStatusBadge } from "@/components/ui/StatusBadge";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { FadeUp, StaggerContainer, StaggerItem } from "@/components/motion/MotionPrimitives";

interface OrderDetailResponse {
  id: string;
  orderNumber?: string;
  totalAmount: number;
  advanceAmount: number;
  remainingAmount: number;
  advancePercentage: number;
  status: string;
  createdAt: string;
  subOrders: Array<{
    id: string;
    subOrderNumber?: string;
    status: string;
    totalAmount: number;
    advancePaidAmount: number;
    remainingBalanceAmount: number;
    stall: { id: string; name: string; campusBlock?: string };
    items: Array<{
      id: string;
      name: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
    }>;
    pickupSchedule?: {
      scheduledPickupTime?: string;
      preparationTimeMinutes?: number;
    } | null;
  }>;
}

interface OrderConfirmationProps {
  orderId: string;
}

export function OrderConfirmation({ orderId }: OrderConfirmationProps) {
  const {
    data: order,
    isLoading,
    isError,
  } = useQuery<OrderDetailResponse>({
    queryKey: ["order", orderId],
    queryFn: () => apiGet<OrderDetailResponse>(`/orders/${orderId}`),
  });

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (isError || !order) {
    return (
      <Card className="max-w-md mx-auto p-8 text-center space-y-3">
        <Receipt className="w-10 h-10 text-[var(--danger)] mx-auto" />
        <div className="text-base font-bold text-[var(--text-primary)]">
          Could not load order confirmation
        </div>
        <p className="text-xs text-[var(--text-secondary)]">
          The order may still be processing. Please check your active orders.
        </p>
        <Link href="/">
          <Button size="sm" variant="outline">
            Return to CampusEats
          </Button>
        </Link>
      </Card>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header Banner */}
      <FadeUp>
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-[var(--success-bg)] text-[var(--success)] flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--success-bg)] text-[var(--success)] text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Advance Deposit Verified by Bank</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)]">
            Order Confirmed &amp; Queued!
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] max-w-md mx-auto">
            Your order has been transmitted to campus food stalls. The kitchen stations are preparing your items.
          </p>
        </div>
      </FadeUp>

      {/* Order Overview Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-[var(--text-tertiary)] uppercase">
                Master Order
              </div>
              <CardTitle className="text-lg">
                #{order.orderNumber || order.id.slice(0, 8).toUpperCase()}
              </CardTitle>
            </div>
            <OrderStatusBadge status={order.status as never} size="md" />
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Sub-Orders list */}
          <div className="space-y-3">
            <div className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">
              Stall Sub-Orders ({order.subOrders.length})
            </div>

            <StaggerContainer className="space-y-3">
              {order.subOrders.map((subOrder) => (
                <StaggerItem key={subOrder.id}>
                  <div className="p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-2.5">
                    <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
                      <div className="flex items-center gap-2">
                        <Store className="w-4 h-4 text-[var(--accent)]" />
                        <span className="text-xs font-bold text-[var(--text-primary)]">
                          {subOrder.stall.name}
                        </span>
                      </div>
                      <OrderStatusBadge status={subOrder.status as never} size="sm" />
                    </div>

                    {/* Pickup time */}
                    {subOrder.pickupSchedule?.scheduledPickupTime && (
                      <div className="flex items-center gap-1.5 text-xs text-[var(--accent-text)] font-semibold">
                        <Clock className="w-3.5 h-3.5 text-[var(--accent)]" />
                        <span>
                          Guaranteed Pickup:{" "}
                          {new Date(
                            subOrder.pickupSchedule.scheduledPickupTime
                          ).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    )}

                    {/* Items */}
                    <div className="space-y-1 pt-1">
                      {subOrder.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex justify-between text-xs text-[var(--text-secondary)]"
                        >
                          <span>
                            {item.quantity} &times; {item.name}
                          </span>
                          <span className="font-medium text-[var(--text-primary)]">
                            ₹{(Number(item.unitPrice) * item.quantity).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>

          {/* Payment Summary */}
          <div className="pt-3 border-t border-[var(--border-subtle)] space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-[var(--text-secondary)]">Master Total:</span>
              <span className="font-bold text-[var(--text-primary)]">
                ₹{Number(order.totalAmount).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-[var(--success)]">
              <span>Advance Paid ({order.advancePercentage}%):</span>
              <span className="font-bold">
                ₹{Number(order.advanceAmount).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-[var(--text-primary)]">
              <span className="font-semibold">Balance Due at Counter:</span>
              <span className="font-extrabold text-sm">
                ₹{Number(order.remainingAmount).toFixed(2)}
              </span>
            </div>
          </div>
        </CardContent>

        <CardFooter className="pt-4 flex flex-col sm:flex-row justify-between gap-3">
          <Link href="/orders" className="w-full sm:w-auto">
            <Button variant="outline" size="sm" className="w-full">
              View All Orders
            </Button>
          </Link>
          <Link href={`/orders/${order.id}`} className="w-full sm:w-auto">
            <Button
              variant="primary"
              size="sm"
              className="w-full"
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Track Live Preparation
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
