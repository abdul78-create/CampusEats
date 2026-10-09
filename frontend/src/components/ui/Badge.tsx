import React from "react";
import { cn } from "@/lib/utils/cn";

export type BadgeVariant =
  | "default"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

export type BadgeSize = "sm" | "md";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  pulseDot?: boolean;
}

const variantStyles: Record<BadgeVariant, { container: string; dot: string }> = {
  default: {
    container:
      "bg-[var(--neutral-100)] dark:bg-[var(--neutral-800)] text-[var(--text-primary)] border border-[var(--border-subtle)]",
    dot: "bg-[var(--text-secondary)]",
  },
  brand: {
    container:
      "bg-[var(--brand-50)] dark:bg-[var(--brand-900)] text-[var(--brand-800)] dark:text-[var(--brand-200)] border border-[var(--brand-200)] dark:border-[var(--brand-800)]",
    dot: "bg-[var(--brand-500)]",
  },
  success: {
    container:
      "bg-[var(--success-bg)] text-[var(--success)] border border-[var(--success)]/20",
    dot: "bg-[var(--success)]",
  },
  warning: {
    container:
      "bg-[var(--warning-bg)] text-[var(--warning)] border border-[var(--warning)]/20",
    dot: "bg-[var(--warning)]",
  },
  danger: {
    container:
      "bg-[var(--danger-bg)] text-[var(--danger)] border border-[var(--danger)]/20",
    dot: "bg-[var(--danger)]",
  },
  info: {
    container:
      "bg-[var(--info-bg)] text-[var(--info)] border border-[var(--info)]/20",
    dot: "bg-[var(--info)]",
  },
  neutral: {
    container:
      "bg-[var(--neutral-100)] dark:bg-[var(--neutral-800)] text-[var(--text-secondary)] border border-transparent",
    dot: "bg-[var(--text-tertiary)]",
  },
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-[11px] gap-1 rounded-full font-medium tracking-tight",
  md: "px-2.5 py-1 text-xs gap-1.5 rounded-full font-medium",
};

export function Badge({
  variant = "default",
  size = "md",
  dot = false,
  pulseDot = false,
  className,
  children,
  ...props
}: BadgeProps) {
  const styles = variantStyles[variant];

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center font-medium select-none whitespace-nowrap",
        styles.container,
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            styles.dot,
            pulseDot && "animate-pulse"
          )}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
