"use client";

import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Store, SlidersHorizontal } from "lucide-react";
import { apiGet } from "@/lib/api/client";
import { StallCard } from "./StallCard";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { StallCardSkeleton } from "@/components/ui/Skeleton";
import { StaggerContainer, StaggerItem } from "@/components/motion/MotionPrimitives";
import type { Stall } from "@/types/api";

export function StallList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const {
    data: stalls,
    isLoading,
    isError,
    refetch,
  } = useQuery<Stall[]>({
    queryKey: ["stalls"],
    queryFn: () => apiGet<Stall[]>("/stalls"),
  });

  const filteredStalls = useMemo(() => {
    if (!stalls) return [];
    return stalls.filter((stall) => {
      const nameMatch = stall.name.toLowerCase().includes(searchQuery.toLowerCase());
      const blockMatch = stall.campusBlock
        ? stall.campusBlock.toLowerCase().includes(searchQuery.toLowerCase())
        : false;
      const matchesSearch = nameMatch || blockMatch;

      const stallStatus = stall.liveStatus || stall.status || "OPEN";
      if (statusFilter === "open") {
        return matchesSearch && (stallStatus === "OPEN" || stallStatus === "BUSY");
      }
      if (statusFilter === "closed") {
        return matchesSearch && (stallStatus === "CLOSED" || stallStatus === "TEMPORARILY_PAUSED");
      }
      return matchesSearch;
    });
  }, [stalls, searchQuery, statusFilter]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <StallCardSkeleton />
        <StallCardSkeleton />
        <StallCardSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-12 text-center rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-4">
        <Store className="w-12 h-12 text-[var(--danger)] mx-auto" />
        <div className="text-lg font-bold text-[var(--text-primary)]">
          Could not load campus stalls
        </div>
        <p className="text-xs text-[var(--text-secondary)]">
          Please verify your connection to the campus dining server.
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Search & Filter Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="w-full sm:max-w-md">
          <Input
            placeholder="Search by stall name or campus block..."
            leftIcon={<Search className="w-4 h-4" />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <Tabs
          tabs={[
            { id: "all", label: "All Stalls" },
            { id: "open", label: "Open Now" },
            { id: "closed", label: "Closed" },
          ]}
          activeId={statusFilter}
          onChange={setStatusFilter}
        />
      </div>

      {/* Stall Grid */}
      {filteredStalls.length > 0 ? (
        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredStalls.map((stall) => (
            <StaggerItem key={stall.id}>
              <StallCard stall={stall} />
            </StaggerItem>
          ))}
        </StaggerContainer>
      ) : (
        <div className="p-12 text-center rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-4">
          <SlidersHorizontal className="w-10 h-10 text-[var(--text-tertiary)] mx-auto" />
          <div className="text-base font-bold text-[var(--text-primary)]">
            No stalls match your search
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Try adjusting your search keywords or switching filters.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSearchQuery("");
              setStatusFilter("all");
            }}
          >
            Reset Filters
          </Button>
        </div>
      )}
    </div>
  );
}
