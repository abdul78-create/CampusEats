"use client";

import React, { forwardRef } from "react";
import { cn } from "@/lib/utils/cn";
import { ChevronDown, AlertCircle } from "lucide-react";

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options?: SelectOption[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      helperText,
      options,
      id,
      className,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const selectId =
      id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] select-none"
          >
            {label}
          </label>
        )}

        <div className="relative flex items-center">
          <select
            id={selectId}
            ref={ref}
            disabled={disabled}
            aria-invalid={!!error}
            aria-describedby={
              error
                ? `${selectId}-error`
                : helperText
                ? `${selectId}-helper`
                : undefined
            }
            className={cn(
              "w-full h-11 pl-3.5 pr-10 rounded-xl bg-[var(--bg-surface)] text-[var(--text-primary)] text-sm",
              "border border-[var(--border-default)] appearance-none cursor-pointer",
              "transition-all duration-150 shadow-[var(--shadow-xs)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:border-[var(--accent)]",
              error &&
                "border-[var(--danger)] focus-visible:ring-[var(--danger)] focus-visible:border-[var(--danger)]",
              disabled &&
                "bg-[var(--neutral-100)] dark:bg-[var(--neutral-800)] text-[var(--text-tertiary)] cursor-not-allowed opacity-60 shadow-none",
              className
            )}
            {...props}
          >
            {options
              ? options.map((opt) => (
                  <option
                    key={opt.value}
                    value={opt.value}
                    disabled={opt.disabled}
                  >
                    {opt.label}
                  </option>
                ))
              : children}
          </select>

          <div className="absolute right-3.5 flex items-center pointer-events-none text-[var(--text-tertiary)]">
            {error ? (
              <AlertCircle className="w-4 h-4 text-[var(--danger)]" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-4 h-4" aria-hidden="true" />
            )}
          </div>
        </div>

        {error ? (
          <p
            id={`${selectId}-error`}
            className="text-xs text-[var(--danger)] font-medium flex items-center gap-1 mt-0.5"
            role="alert"
          >
            {error}
          </p>
        ) : helperText ? (
          <p
            id={`${selectId}-helper`}
            className="text-xs text-[var(--text-tertiary)] mt-0.5"
          >
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Select.displayName = "Select";
