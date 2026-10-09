"use client";

import React, { useEffect, useCallback } from "react";
import { motion, AnimatePresence, type HTMLMotionProps } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { modalOverlay, modalContent } from "@/components/motion/variants";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
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

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
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

          {/* Modal Container */}
          <div className="relative z-10 w-full max-w-lg my-8 flex items-center justify-center pointer-events-none">
            <div className="w-full pointer-events-auto">{children}</div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}

export interface DialogContentProps
  extends Omit<HTMLMotionProps<"div">, "children"> {
  children?: React.ReactNode;
  onClose?: () => void;
  showCloseButton?: boolean;
}

export function DialogContent({
  className,
  children,
  onClose,
  showCloseButton = true,
  ...props
}: DialogContentProps) {
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      variants={modalContent}
      initial="initial"
      animate="animate"
      exit="exit"
      className={cn(
        "relative w-full rounded-2xl bg-[var(--bg-surface)] p-6 sm:p-7 shadow-[var(--shadow-xl)]",
        "border border-[var(--border-subtle)] text-[var(--text-primary)] focus:outline-none",
        className
      )}
      {...props}
    >
      {showCloseButton && onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-4 right-4 p-2 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--neutral-100)] dark:hover:bg-[var(--neutral-800)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          <X className="w-4 h-4" />
        </button>
      )}
      {children}
    </motion.div>
  );
}

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-1.5 text-left mb-4", className)}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        "text-xl font-bold tracking-tight text-[var(--text-primary)]",
        className
      )}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-sm text-[var(--text-secondary)] leading-relaxed", className)}
      {...props}
    />
  );
}

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 mt-6 pt-4 border-t border-[var(--border-subtle)]",
        className
      )}
      {...props}
    />
  );
}
