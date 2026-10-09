"use client";

import React, { useState, useMemo } from "react";
import { Search, UtensilsCrossed, Leaf } from "lucide-react";
import { MenuItemCard } from "./MenuItemCard";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { MenuItemSkeleton } from "@/components/ui/Skeleton";
import { StaggerContainer, StaggerItem } from "@/components/motion/MotionPrimitives";
import type { MenuItem } from "@/types/api";

interface MenuListProps {
  items: MenuItem[];
  stall: { id: string; name: string };
  isLoading?: boolean;
}

export function MenuList({ items, stall, isLoading = false }: MenuListProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [vegOnly, setVegOnly] = useState(false);

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set);
  }, [items]);

  const tabs = useMemo(() => {
    return [
      { id: "all", label: "All Items" },
      ...categories.map((c) => ({ id: c, label: c })),
    ];
  }, [categories]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = category === "all" || item.category === category;
      const matchesVeg = !vegOnly || item.isVegetarian;
      return matchesSearch && matchesCategory && matchesVeg;
    });
  }, [items, search, category, vegOnly]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <MenuItemSkeleton />
        <MenuItemSkeleton />
        <MenuItemSkeleton />
        <MenuItemSkeleton />
        <MenuItemSkeleton />
        <MenuItemSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="w-full sm:max-w-xs">
          <Input
            placeholder="Search menu items..."
            leftIcon={<Search className="w-4 h-4" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <Button
            size="sm"
            variant={vegOnly ? "primary" : "outline"}
            leftIcon={<Leaf className="w-3.5 h-3.5 text-emerald-500" />}
            onClick={() => setVegOnly((prev) => !prev)}
          >
            Pure Veg
          </Button>
        </div>
      </div>

      {/* Category Tabs */}
      {categories.length > 1 && (
        <div className="overflow-x-auto pb-2">
          <Tabs tabs={tabs} activeId={category} onChange={setCategory} />
        </div>
      )}

      {/* Items Grid */}
      {filteredItems.length > 0 ? (
        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredItems.map((item) => (
            <StaggerItem key={item.id}>
              <MenuItemCard item={item} stall={stall} />
            </StaggerItem>
          ))}
        </StaggerContainer>
      ) : (
        <div className="p-12 text-center rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] space-y-4">
          <UtensilsCrossed className="w-10 h-10 text-[var(--text-tertiary)] mx-auto" />
          <div className="text-base font-bold text-[var(--text-primary)]">
            No dishes found
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Try resetting your search query or vegetarian filter.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSearch("");
              setCategory("all");
              setVegOnly(false);
            }}
          >
            Reset Filters
          </Button>
        </div>
      )}
    </div>
  );
}
