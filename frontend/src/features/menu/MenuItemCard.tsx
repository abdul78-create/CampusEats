"use client";

import React from "react";
import { Plus, Minus, Clock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useCart } from "@/features/cart/useCart";
import type { MenuItem } from "@/types/api";

interface MenuItemCardProps {
  item: MenuItem;
  stall: { id: string; name: string };
}

export function MenuItemCard({ item, stall }: MenuItemCardProps) {
  const { addItem, updateQuantity, getItemQuantity } = useCart();
  const quantity = getItemQuantity(item.id);

  const isAvailable = item.isAvailable !== false && !item.isSoldOut;
  const isSoldOut = !isAvailable || (item.availableQuantity !== undefined && item.availableQuantity !== null && item.availableQuantity <= 0);

  return (
    <div
      className={`p-4 sm:p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-[var(--shadow-xs)] hover:shadow-[var(--shadow-md)] transition-all flex flex-col justify-between ${
        isSoldOut ? "opacity-75" : ""
      }`}
    >
      <div>
        {/* Top Badges */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            {item.isVegetarian ? (
              <span className="w-4 h-4 rounded border border-emerald-600 flex items-center justify-center p-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
              </span>
            ) : (
              <span className="w-4 h-4 rounded border border-rose-600 flex items-center justify-center p-0.5">
                <span className="w-2 h-2 rounded-full bg-rose-600" />
              </span>
            )}
            <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
              {item.category}
            </span>
          </div>

          {isSoldOut ? (
            <Badge variant="danger" size="sm">
              Sold Out
            </Badge>
          ) : (
            <div className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
              <Clock className="w-3 h-3" />
              <span>~{item.preparationTimeMinutes || 10}m prep</span>
            </div>
          )}
        </div>

        {/* Title & Description */}
        <h3 className="text-base font-bold text-[var(--text-primary)] leading-snug">
          {item.name}
        </h3>
        {item.description && (
          <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2 leading-relaxed">
            {item.description}
          </p>
        )}
      </div>

      {/* Price & Cart Actions */}
      <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase font-semibold text-[var(--text-tertiary)]">
            Price
          </div>
          <div className="text-base sm:text-lg font-extrabold text-[var(--text-primary)]">
            ₹{item.price.toFixed(2)}
          </div>
        </div>

        <div>
          {isSoldOut ? (
            <span className="text-xs font-semibold text-[var(--danger)] flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              Unavailable
            </span>
          ) : quantity > 0 ? (
            /* Stepper */
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--accent-subtle)] border border-[var(--brand-300)]/40">
              <button
                type="button"
                onClick={() => updateQuantity(item.id, -1)}
                aria-label={`Decrease quantity for ${item.name}`}
                className="w-7 h-7 rounded-lg bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--neutral-100)] flex items-center justify-center transition-colors shadow-xs"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-7 text-center font-bold text-xs text-[var(--accent-text)]">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => updateQuantity(item.id, 1)}
                aria-label={`Increase quantity for ${item.name}`}
                className="w-7 h-7 rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] flex items-center justify-center transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            /* Add Button */
            <Button
              size="sm"
              variant="primary"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => addItem(item, stall)}
            >
              Add
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
