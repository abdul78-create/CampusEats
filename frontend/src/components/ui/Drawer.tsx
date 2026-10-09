"use client";

import React, { useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import {
  modalOverlay,
  drawerRight,
  drawerBottom,
} from "@/components/motion/variants";

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position?: "right" | "bottom";
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function Drawer({
  open,
  onOpenChange,
  position = "right",
  title,
  description,
  children,
  footer,
  className,
}: DrawerProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
      }
    },
    [onOpenChange]
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  const drawerVariants = position === "right" ? drawerRight : drawerBottom;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <motion.div
            variants={modalOverlay}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={() => onOpenChange(false)}
            className="fixed inset-0 bg-[var(--bg-overlay)] backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* Drawer Panel */}
          <div
            className={cn(
              "fixed z-10 flex",
              position === "right"
                ? "inset-y-0 right-0 max-w-full pl-10"
                : "inset-x-0 bottom-0 max-h-[90vh] pt-10"
            )}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              variants={drawerVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className={cn(
                "w-screen bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-[var(--shadow-xl)] flex flex-col border-[var(--border-subtle)]",
                position === "right"
                  ? "max-w-md border-l h-full"
                  : "w-full rounded-t-3xl border-t max-h-[85vh]",
                className
              )}
            >
              {/* Optional pull handle on bottom drawer */}
              {position === "bottom" && (
                <div className="w-full flex items-center justify-center pt-3 pb-1">
                  <div className="w-12 h-1.5 rounded-full bg-[var(--neutral-300)] dark:bg-[var(--neutral-600)]" />
                </div>
              )}

              {/* Header */}
              <div className="px-6 py-5 border-b border-[var(--border-subtle)] flex items-center justify-between">
                <div>
                  {title && (
                    <h2 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      {description}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  aria-label="Close drawer"
                  className="p-2 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--neutral-100)] dark:hover:bg-[var(--neutral-800)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6">{children}</div>

              {/* Footer */}
              {footer && (
                <div className="p-6 border-t border-[var(--border-subtle)] bg-[var(--bg-base)]/50">
                  {footer}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
