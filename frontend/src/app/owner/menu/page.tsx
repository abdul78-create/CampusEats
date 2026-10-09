import React from "react";
import type { Metadata } from "next";
import { Navbar } from "@/components/ui/Navbar";
import { MenuManagement } from "@/features/owner/MenuManagement";

export const metadata: Metadata = {
  title: "Menu & Inventory Management | CampusEats Owner Portal",
  description: "Manage dishes, toggle availability, update prices, and adjust stock quantities.",
};

export default function OwnerMenuPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)]">
      <Navbar />

      <main className="flex-1 w-full">
        <MenuManagement />
      </main>
    </div>
  );
}
