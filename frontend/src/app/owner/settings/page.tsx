import React from "react";
import type { Metadata } from "next";
import { Navbar } from "@/components/ui/Navbar";
import { StallSettings } from "@/features/owner/StallSettings";

export const metadata: Metadata = {
  title: "Stall Settings & Capacity | CampusEats Owner Portal",
  description: "Configure operational live status, kitchen queue limits, and parallel cooking lines.",
};

export default function OwnerSettingsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)]">
      <Navbar />

      <main className="flex-1 w-full">
        <StallSettings />
      </main>
    </div>
  );
}
