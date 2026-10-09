import React from "react";
import type { Metadata } from "next";
import { Navbar } from "@/components/ui/Navbar";
import { OwnerDashboard } from "@/features/owner/OwnerDashboard";

export const metadata: Metadata = {
  title: "Stall Dashboard | CampusEats Owner Portal",
  description: "Manage your campus food stall, live orders, menu, and kitchen capacity.",
};

export default function OwnerDashboardPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)]">
      <Navbar />

      <main className="flex-1 w-full">
        <OwnerDashboard />
      </main>
    </div>
  );
}
