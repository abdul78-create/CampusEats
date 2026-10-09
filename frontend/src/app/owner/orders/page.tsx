import React from "react";
import type { Metadata } from "next";
import { Navbar } from "@/components/ui/Navbar";
import { KitchenQueue } from "@/features/owner/KitchenQueue";

export const metadata: Metadata = {
  title: "Kitchen Orders Queue | CampusEats Owner Portal",
  description: "Live kitchen order management, preparation advancement, and counter cash settlement.",
};

export default function OwnerOrdersPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)]">
      <Navbar />

      <main className="flex-1 w-full">
        <KitchenQueue />
      </main>
    </div>
  );
}
