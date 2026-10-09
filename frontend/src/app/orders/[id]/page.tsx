import React from "react";
import type { Metadata } from "next";
import { Navbar } from "@/components/ui/Navbar";
import { OrderTracker } from "@/features/orders/OrderTracker";

export const metadata: Metadata = {
  title: "Live Order Tracking | CampusEats",
  description: "Real-time kitchen preparation status and pickup instructions.",
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)]">
      <Navbar />

      <main className="flex-1 w-full">
        <OrderTracker orderId={id} />
      </main>
    </div>
  );
}
