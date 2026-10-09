"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  fullWidth?: boolean;
  className?: string;
  layoutId?: string;
}

export function Tabs({
  tabs,
  activeId,
  onChange,
  fullWidth = false,
  className,
  layoutId = "active-tab-indicator",
}: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex p-1.5 rounded-2xl bg-[var(--neutral-100)] dark:bg-[var(--neutral-800)] border border-[var(--border-subtle)]",
        fullWidth && "w-full",
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors duration-150 select-none",
              "flex items-center justify-center gap-2 z-10",
              fullWidth && "flex-1",
              isActive
                ? "text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            {isActive && (
              <motion.div
                layoutId={layoutId}
                transition={{ type: "spring", stiffness: 450, damping: 35 }}
                className="absolute inset-0 rounded-xl bg-[var(--bg-surface)] shadow-[var(--shadow-sm)] border border-[var(--border-subtle)] -z-10"
              />
            )}
            {tab.icon && (
              <span className="w-4 h-4 shrink-0 flex items-center justify-center">
                {tab.icon}
              </span>
            )}
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none",
                  isActive
                    ? "bg-[var(--brand-100)] dark:bg-[var(--brand-900)] text-[var(--brand-800)] dark:text-[var(--brand-200)]"
                    : "bg-[var(--neutral-200)] dark:bg-[var(--neutral-700)] text-[var(--text-secondary)]"
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
