import React from "react";
import type { Metadata } from "next";
import { Navbar } from "@/components/ui/Navbar";
import { OrderList } from "@/features/orders/OrderList";

export const metadata: Metadata = {
  title: "My Orders | CampusEats",
  description: "Track live preparation progress and view your past campus dining orders.",
};

export default function OrdersPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)]">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            My Orders
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Live kitchen preparation status, pickup slots, and counter settlements.
          </p>
        </div>

        <OrderList />
      </main>
    </div>
  );
}
