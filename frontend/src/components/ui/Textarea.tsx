"use client";

import React, { forwardRef } from "react";
import { cn } from "@/lib/utils/cn";
import { AlertCircle } from "lucide-react";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      error,
      helperText,
      id,
      className,
      disabled,
      rows = 3,
      ...props
    },
    ref
  ) => {
    const textareaId =
      id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] select-none"
          >
            {label}
          </label>
        )}

        <div className="relative">
          <textarea
            id={textareaId}
            ref={ref}
            rows={rows}
            disabled={disabled}
            aria-invalid={!!error}
            aria-describedby={
              error
                ? `${textareaId}-error`
                : helperText
                ? `${textareaId}-helper`
                : undefined
            }
            className={cn(
              "w-full p-3 rounded-xl bg-[var(--bg-surface)] text-[var(--text-primary)] text-sm",
              "border border-[var(--border-default)] placeholder:text-[var(--text-tertiary)]",
              "transition-all duration-150 shadow-[var(--shadow-xs)] resize-y min-h-[80px]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:border-[var(--accent)]",
              error &&
                "border-[var(--danger)] focus-visible:ring-[var(--danger)] focus-visible:border-[var(--danger)]",
              disabled &&
                "bg-[var(--neutral-100)] dark:bg-[var(--neutral-800)] text-[var(--text-tertiary)] cursor-not-allowed opacity-60 shadow-none",
              className
            )}
            {...props}
          />

          {error && (
            <div className="absolute top-3 right-3 flex items-center pointer-events-none text-[var(--danger)]">
              <AlertCircle className="w-4 h-4" aria-hidden="true" />
            </div>
          )}
        </div>

        {error ? (
          <p
            id={`${textareaId}-error`}
            className="text-xs text-[var(--danger)] font-medium flex items-center gap-1 mt-0.5"
            role="alert"
          >
            {error}
          </p>
        ) : helperText ? (
          <p
            id={`${textareaId}-helper`}
            className="text-xs text-[var(--text-tertiary)] mt-0.5"
          >
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
