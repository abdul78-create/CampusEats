"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import type { MenuItem } from "@/types/api";

export interface CartItem {
  menuItem: MenuItem;
  stallId: string;
  stallName: string;
  quantity: number;
}

export interface StallGroupedItems {
  stallId: string;
  stallName: string;
  items: CartItem[];
  subtotal: number;
  maxPrepTime: number;
}

export interface CartContextType {
  items: CartItem[];
  stallGroups: StallGroupedItems[];
  itemCount: number;
  subtotal: number;
  advancePercentage: number;
  setAdvancePercentage: (pct: number) => void;
  advanceAmount: number;
  remainingBalance: number;
  requestedPickupTime: string | null;
  setRequestedPickupTime: (time: string | null) => void;
  addItem: (item: MenuItem, stall: { id: string; name: string }) => void;
  removeItem: (menuItemId: string) => void;
  updateQuantity: (menuItemId: string, delta: number) => void;
  getItemQuantity: (menuItemId: string) => number;
  clearCart: () => void;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
}

const CART_STORAGE_KEY = "ce_cart";
const ALLOWED_ADVANCE_PERCENTAGES = [50, 60, 70, 80, 90, 100];

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [advancePercentage, setAdvancePercentageState] = useState<number>(50);
  const [requestedPickupTime, setRequestedPickupTime] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Load cart from localStorage on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const stored = localStorage.getItem(CART_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setItems(parsed);
          }
        }
      } catch {
        // Ignore corrupted localStorage data
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Ignore storage write errors
    }
  }, [items]);

  const setAdvancePercentage = useCallback((pct: number) => {
    if (ALLOWED_ADVANCE_PERCENTAGES.includes(pct)) {
      setAdvancePercentageState(pct);
    }
  }, []);

  const addItem = useCallback(
    (item: MenuItem, stall: { id: string; name: string }) => {
      setItems((prev) => {
        const existingIdx = prev.findIndex(
          (i) => i.menuItem.id === item.id
        );
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = {
            ...updated[existingIdx],
            quantity: updated[existingIdx].quantity + 1,
          };
          return updated;
        }
        return [
          ...prev,
          {
            menuItem: item,
            stallId: stall.id,
            stallName: stall.name,
            quantity: 1,
          },
        ];
      });
    },
    []
  );

  const removeItem = useCallback((menuItemId: string) => {
    setItems((prev) => prev.filter((i) => i.menuItem.id !== menuItemId));
  }, []);

  const updateQuantity = useCallback((menuItemId: string, delta: number) => {
    setItems((prev) => {
      return prev
        .map((i) => {
          if (i.menuItem.id === menuItemId) {
            const nextQty = i.quantity + delta;
            return nextQty > 0 ? { ...i, quantity: nextQty } : null;
          }
          return i;
        })
        .filter(Boolean) as CartItem[];
    });
  }, []);

  const getItemQuantity = useCallback(
    (menuItemId: string) => {
      const found = items.find((i) => i.menuItem.id === menuItemId);
      return found ? found.quantity : 0;
    },
    [items]
  );

  const clearCart = useCallback(() => {
    setItems([]);
    setRequestedPickupTime(null);
    try {
      localStorage.removeItem(CART_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Multi-stall grouping calculation
  const stallGroups = useMemo(() => {
    const map = new Map<string, StallGroupedItems>();
    for (const item of items) {
      if (!map.has(item.stallId)) {
        map.set(item.stallId, {
          stallId: item.stallId,
          stallName: item.stallName,
          items: [],
          subtotal: 0,
          maxPrepTime: 0,
        });
      }
      const group = map.get(item.stallId)!;
      group.items.push(item);
      group.subtotal += item.menuItem.price * item.quantity;
      group.maxPrepTime = Math.max(
        group.maxPrepTime,
        item.menuItem.preparationTimeMinutes || 10
      );
    }
    return Array.from(map.values());
  }, [items]);

  const itemCount = useMemo(
    () => items.reduce((acc, curr) => acc + curr.quantity, 0),
    [items]
  );

  const subtotal = useMemo(
    () =>
      items.reduce(
        (acc, curr) => acc + curr.menuItem.price * curr.quantity,
        0
      ),
    [items]
  );

  // Exact monetary mathematics (Half-Up rounding, never allow 0%)
  const advanceAmount = useMemo(() => {
    if (subtotal === 0) return 0;
    return Math.round(((subtotal * advancePercentage) / 100) * 100) / 100;
  }, [subtotal, advancePercentage]);

  const remainingBalance = useMemo(() => {
    return Math.max(0, Math.round((subtotal - advanceAmount) * 100) / 100);
  }, [subtotal, advanceAmount]);

  return (
    <CartContext.Provider
      value={{
        items,
        stallGroups,
        itemCount,
        subtotal,
        advancePercentage,
        setAdvancePercentage,
        advanceAmount,
        remainingBalance,
        requestedPickupTime,
        setRequestedPickupTime,
        addItem,
        removeItem,
        updateQuantity,
        getItemQuantity,
        clearCart,
        isCartOpen,
        setIsCartOpen,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextType {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
