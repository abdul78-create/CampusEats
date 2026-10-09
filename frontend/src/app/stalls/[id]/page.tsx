"use client";

import React, { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Store, MapPin, Clock, ArrowLeft } from "lucide-react";
import { apiGet } from "@/lib/api/client";
import { Navbar } from "@/components/ui/Navbar";
import { MenuList } from "@/features/menu/MenuList";
import { FloatingCartButton } from "@/features/menu/FloatingCartButton";
import { CartDrawer } from "@/features/cart/CartDrawer";
import { StallStatusBadge } from "@/components/ui/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import type { Stall, MenuItem } from "@/types/api";

interface StallDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function StallDetailPage({ params }: StallDetailPageProps) {
  const { id } = use(params);

  // Fetch Stall Details
  const {
    data: stall,
    isLoading: isStallLoading,
    isError: isStallError,
  } = useQuery<Stall>({
    queryKey: ["stall", id],
    queryFn: () => apiGet<Stall>(`/stalls/${id}`),
  });

  // Fetch Stall Menu
  const {
    data: menuItems,
    isLoading: isMenuLoading,
  } = useQuery<MenuItem[]>({
    queryKey: ["stall-menu", id],
    queryFn: () => apiGet<MenuItem[]>(`/stalls/${id}/menu`),
  });

  const stallStatus = stall?.liveStatus || stall?.status || "OPEN";

  if (isStallError) {
    return (
      <div className="min-h-screen flex flex-col bg-[var(--bg-base)]">
        <Navbar />
        <main className="flex-1 max-w-xl mx-auto p-8 text-center space-y-4">
          <Store className="w-12 h-12 text-[var(--danger)] mx-auto" />
          <h1 className="text-xl font-bold">Stall Not Found</h1>
          <p className="text-xs text-[var(--text-secondary)]">
            This campus stall may have been deactivated or does not exist.
          </p>
          <Link href="/stalls">
            <Button size="sm" variant="outline">
              Back to Stalls
            </Button>
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      <Navbar />

      <main id="main-content" className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12">
        {/* Back Link */}
        <Link
          href="/stalls"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>All Campus Stalls</span>
        </Link>

        {/* Stall Header Banner */}
        <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-[var(--shadow-sm)] mb-10">
          <div className="h-36 sm:h-48 bg-gradient-to-r from-[var(--brand-500)] to-[var(--brand-700)] p-6 flex items-end justify-between relative">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white text-[var(--accent)] flex items-center justify-center shadow-lg">
                <Store className="w-8 h-8 sm:w-10 sm:h-10" />
              </div>
              <div className="text-white">
                {isStallLoading ? (
                  <Skeleton className="h-8 w-48 bg-white/30" />
                ) : (
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight drop-shadow-xs">
                    {stall?.name}
                  </h1>
                )}
                {stall?.campusBlock && (
                  <div className="flex items-center gap-1 text-xs text-white/90 mt-1 font-medium">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Campus Block {stall.campusBlock}</span>
                  </div>
                )}
              </div>
            </div>

            {stall && <StallStatusBadge status={stallStatus} size="md" />}
          </div>

          <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-xs sm:text-sm text-[var(--text-secondary)] max-w-2xl leading-relaxed">
              {stall?.description || "Freshly cooked meals, snacks, and beverages prepared to order."}
            </p>

            <div className="flex items-center gap-4 text-xs text-[var(--text-tertiary)] shrink-0">
              <div className="flex items-center gap-1.5 font-semibold text-[var(--text-secondary)]">
                <Clock className="w-4 h-4 text-[var(--accent)]" />
                <span>Est. Preparation ~10-15 mins</span>
              </div>
            </div>
          </div>
        </div>

        {/* Menu Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
              Stall Menu &amp; Offerings
            </h2>
            <span className="text-xs text-[var(--text-secondary)]">
              {menuItems?.length || 0} items available
            </span>
          </div>

          <MenuList
            items={menuItems || []}
            stall={{ id, name: stall?.name || "Stall" }}
            isLoading={isMenuLoading}
          />
        </div>
      </main>

      <FloatingCartButton />
      <CartDrawer />
    </div>
  );
}
