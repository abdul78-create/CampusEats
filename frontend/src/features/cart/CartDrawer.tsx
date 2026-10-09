"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ShoppingBag,
  Store,
  Clock,
  Trash2,
  Plus,
  Minus,
  ArrowRight,
} from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { useCart } from "./useCart";

export function CartDrawer() {
  const [selectedMinutes, setSelectedMinutes] = useState<number>(15);
  const {
    items,
    stallGroups,
    itemCount,
    subtotal,
    advancePercentage,
    setAdvancePercentage,
    advanceAmount,
    remainingBalance,
    setRequestedPickupTime,
    updateQuantity,
    removeItem,
    clearCart,
    isCartOpen,
    setIsCartOpen,
  } = useCart();

  const pickupOptions = [
    { label: "Standard (~15 min)", minutes: 15 },
    { label: "In 30 min", minutes: 30 },
    { label: "In 45 min", minutes: 45 },
    { label: "In 1 hour", minutes: 60 },
  ];

  return (
    <Drawer
      open={isCartOpen}
      onOpenChange={setIsCartOpen}
      position="right"
      title="Your Food Tray"
      description={`${itemCount} item${itemCount === 1 ? "" : "s"} across ${stallGroups.length} stall${stallGroups.length === 1 ? "" : "s"}`}
      footer={
        itemCount > 0 ? (
          <div className="space-y-4">
            <div className="space-y-1.5 text-xs text-[var(--text-secondary)]">
              <div className="flex justify-between">
                <span>Order Total:</span>
                <span className="font-bold text-[var(--text-primary)]">
                  ₹{subtotal.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Advance Payable ({advancePercentage}%):</span>
                <span className="font-bold text-[var(--accent-text)]">
                  ₹{advanceAmount.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Balance at Counter:</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  ₹{remainingBalance.toFixed(2)}
                </span>
              </div>
            </div>

            <Link href="/checkout" onClick={() => setIsCartOpen(false)}>
              <Button
                variant="primary"
                className="w-full"
                size="lg"
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Proceed to Checkout (₹{advanceAmount.toFixed(2)})
              </Button>
            </Link>
          </div>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <div className="py-16 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-[var(--neutral-100)] dark:bg-[var(--neutral-800)] text-[var(--text-tertiary)] flex items-center justify-center mx-auto">
            <ShoppingBag className="w-8 h-8" />
          </div>
          <div className="text-base font-bold text-[var(--text-primary)]">
            Your tray is empty
          </div>
          <p className="text-xs text-[var(--text-secondary)] max-w-xs mx-auto">
            Browse campus stalls and add delicious dishes to your scheduled ordering tray.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsCartOpen(false)}
          >
            Browse Menu
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Multi-stall Grouping */}
          <div className="space-y-4">
            {stallGroups.map((group) => (
              <div
                key={group.stallId}
                className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-base)] overflow-hidden"
              >
                {/* Stall Sub-order Header */}
                <div className="p-3.5 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Store className="w-4 h-4 text-[var(--accent)]" />
                    <span className="text-xs font-bold text-[var(--text-primary)] truncate max-w-[180px]">
                      {group.stallName}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                    <Clock className="w-3 h-3" />
                    <span>~{group.maxPrepTime}m</span>
                  </div>
                </div>

                {/* Items in this stall */}
                <div className="p-3 space-y-3">
                  {group.items.map((item) => (
                    <div
                      key={item.menuItem.id}
                      className="flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[var(--text-primary)] truncate">
                          {item.menuItem.name}
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          ₹{item.menuItem.price.toFixed(2)} each
                        </div>
                      </div>

                      {/* Quantity Stepper */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.menuItem.id, -1)}
                          className="w-6 h-6 rounded-md bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] flex items-center justify-center hover:bg-[var(--neutral-100)]"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-5 text-center font-bold text-xs">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.menuItem.id, 1)}
                          className="w-6 h-6 rounded-md bg-[var(--accent)] text-white flex items-center justify-center hover:bg-[var(--accent-hover)]"
                        >
                          <Plus className="w-3 h-3" />
                        </button>

                        <button
                          type="button"
                          onClick={() => removeItem(item.menuItem.id)}
                          aria-label="Remove item"
                          className="p-1 text-[var(--text-tertiary)] hover:text-[var(--danger)] transition-colors ml-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="font-bold text-[var(--text-primary)] text-right w-14">
                        ₹{(item.menuItem.price * item.quantity).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Advance Percentage Selector */}
          <div className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-[var(--text-primary)]">
                Advance Deposit Percentage
              </span>
              <span className="font-bold text-[var(--accent)]">
                {advancePercentage}%
              </span>
            </div>

            <div className="grid grid-cols-6 gap-1.5">
              {[50, 60, 70, 80, 90, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setAdvancePercentage(pct)}
                  className={`py-1.5 text-xs font-bold rounded-lg border transition-all ${
                    advancePercentage === pct
                      ? "bg-[var(--accent)] border-[var(--accent)] text-white shadow-xs"
                      : "bg-[var(--bg-base)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-default)]"
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>

            <p className="text-[11px] text-[var(--text-tertiary)] leading-tight">
              A minimum 50% advance deposit is legally required to guarantee kitchen station capacity.
            </p>
          </div>

          {/* Requested Pickup Time */}
          <div className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-3">
            <div className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span>Requested Pickup Window</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {pickupOptions.map((opt) => {
                const isSelected = selectedMinutes === opt.minutes;

                return (
                  <button
                    key={opt.minutes}
                    type="button"
                    onClick={() => {
                      setSelectedMinutes(opt.minutes);
                      const targetDate = new Date(Date.now() + opt.minutes * 60 * 1000);
                      setRequestedPickupTime(targetDate.toISOString());
                    }}
                    className={`p-2.5 rounded-xl border text-xs font-semibold text-center transition-all ${
                      isSelected
                        ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent-text)]"
                        : "border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:border-[var(--border-default)]"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div className="p-2.5 rounded-xl bg-[var(--neutral-100)] dark:bg-[var(--neutral-800)] text-[11px] text-[var(--text-secondary)]">
              Pickup slot feasibility is checked by backend queue engines at checkout.
            </div>
          </div>

          {/* Clear Cart Button */}
          <div className="text-center">
            <button
              type="button"
              onClick={clearCart}
              className="text-xs text-[var(--danger)] hover:underline inline-flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              Clear entire tray
            </button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
