"use client";

import React, { forwardRef } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  description?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, id, className, disabled, checked, ...props }, ref) => {
    const checkboxId =
      id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <label
        htmlFor={checkboxId}
        className={cn(
          "inline-flex items-start gap-3 cursor-pointer select-none",
          disabled && "cursor-not-allowed opacity-60",
          className
        )}
      >
        <div className="relative flex items-center justify-center mt-0.5">
          <input
            id={checkboxId}
            ref={ref}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            className="peer sr-only"
            {...props}
          />
          <div
            className={cn(
              "w-5 h-5 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)]",
              "transition-all duration-150 shadow-[var(--shadow-xs)]",
              "peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent)] peer-focus-visible:ring-offset-2",
              "peer-checked:bg-[var(--accent)] peer-checked:border-[var(--accent)] peer-checked:text-white",
              "flex items-center justify-center"
            )}
          >
            <Check className="w-3.5 h-3.5 opacity-0 peer-checked:opacity-100 transition-opacity duration-150 stroke-[3]" />
          </div>
        </div>

        {(label || description) && (
          <div className="flex flex-col text-sm">
            {label && (
              <span className="font-medium text-[var(--text-primary)] leading-tight">
                {label}
              </span>
            )}
            {description && (
              <span className="text-xs text-[var(--text-secondary)] mt-0.5 leading-normal">
                {description}
              </span>
            )}
          </div>
        )}
      </label>
    );
  }
);

Checkbox.displayName = "Checkbox";
