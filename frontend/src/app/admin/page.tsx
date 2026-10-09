"use client";

import React from "react";
import { Navbar } from "@/components/ui/Navbar";
import { AdminDashboard } from "@/features/admin/AdminDashboard";
import { FadeUp } from "@/components/motion/MotionPrimitives";

export default function AdminPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <Navbar />

      <main id="main-content" className="flex-1 p-4 sm:p-8">
        <FadeUp>
          <AdminDashboard />
        </FadeUp>
      </main>
    </div>
  );
}
