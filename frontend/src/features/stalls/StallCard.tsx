"use client";

import React from "react";
import Link from "next/link";
import { Store, MapPin, Clock, ArrowRight } from "lucide-react";
import { InteractiveCard, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";
import { StallStatusBadge } from "@/components/ui/StatusBadge";
import type { Stall } from "@/types/api";

interface StallCardProps {
  stall: Stall;
}

export function StallCard({ stall }: StallCardProps) {
  const status = stall.liveStatus || stall.status || "OPEN";
  const isOpen = status === "OPEN" || status === "BUSY";

  return (
    <Link href={`/stalls/${stall.id}`} className="block h-full focus-visible:outline-none">
      <InteractiveCard className="h-full flex flex-col justify-between overflow-hidden">
        {/* Stall Header Graphic Banner */}
        <div className="h-32 bg-gradient-to-br from-[var(--brand-400)] via-[var(--brand-500)] to-[var(--brand-700)] relative p-4 flex items-start justify-between">
          <div className="w-12 h-12 rounded-2xl bg-[var(--bg-surface)] text-[var(--accent)] flex items-center justify-center shadow-md">
            <Store className="w-6 h-6" />
          </div>
          <StallStatusBadge status={status} size="sm" />
        </div>

        <CardHeader className="pt-4 pb-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-xl group-hover:text-[var(--accent)] transition-colors">
                {stall.name}
              </CardTitle>
              {stall.campusBlock && (
                <CardDescription className="flex items-center gap-1.5 mt-1">
                  <MapPin className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>Campus Block {stall.campusBlock}</span>
                </CardDescription>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="py-2 flex-1">
          <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">
            {stall.description || "Authentic freshly prepared campus cuisine with rapid counter pickup."}
          </p>

          {/* Prep info */}
          <div className="mt-4 flex items-center gap-4 text-xs text-[var(--text-tertiary)]">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              <span>Est. ~10-15 mins</span>
            </div>
          </div>
        </CardContent>

        <CardFooter className="pt-3 pb-4 justify-between border-t border-[var(--border-subtle)]">
          <span className="text-xs font-semibold text-[var(--text-secondary)]">
            {isOpen ? "Accepting Orders" : "Closed"}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-[var(--accent)]">
            View Menu
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </CardFooter>
      </InteractiveCard>
    </Link>
  );
}
