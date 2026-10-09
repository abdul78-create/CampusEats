"use client";

import React, { forwardRef } from "react";
import { cn } from "@/lib/utils/cn";
import { AlertCircle } from "lucide-react";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      id,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)] select-none"
          >
            {label}
          </label>
        )}

        <div className="relative flex items-center">
          {leftIcon && (
            <div className="absolute left-3.5 flex items-center pointer-events-none text-[var(--text-tertiary)] shrink-0">
              {leftIcon}
            </div>
          )}

          <input
            id={inputId}
            ref={ref}
            disabled={disabled}
            aria-invalid={!!error}
            aria-describedby={
              error
                ? `${inputId}-error`
                : helperText
                ? `${inputId}-helper`
                : undefined
            }
            className={cn(
              "w-full h-11 px-3.5 rounded-xl bg-[var(--bg-surface)] text-[var(--text-primary)] text-sm",
              "border border-[var(--border-default)] placeholder:text-[var(--text-tertiary)]",
              "transition-all duration-150 shadow-[var(--shadow-xs)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:border-[var(--accent)]",
              leftIcon && "pl-10",
              (rightIcon || error) && "pr-10",
              error &&
                "border-[var(--danger)] focus-visible:ring-[var(--danger)] focus-visible:border-[var(--danger)]",
              disabled &&
                "bg-[var(--neutral-100)] dark:bg-[var(--neutral-800)] text-[var(--text-tertiary)] cursor-not-allowed opacity-60 shadow-none",
              className
            )}
            {...props}
          />

          {error ? (
            <div className="absolute right-3.5 flex items-center pointer-events-none text-[var(--danger)]">
              <AlertCircle className="w-4 h-4" aria-hidden="true" />
            </div>
          ) : (
            rightIcon && (
              <div className="absolute right-3.5 flex items-center text-[var(--text-tertiary)]">
                {rightIcon}
              </div>
            )
          )}
        </div>

        {error ? (
          <p
            id={`${inputId}-error`}
            className="text-xs text-[var(--danger)] font-medium flex items-center gap-1 mt-0.5"
            role="alert"
          >
            {error}
          </p>
        ) : helperText ? (
          <p
            id={`${inputId}-helper`}
            className="text-xs text-[var(--text-tertiary)] mt-0.5"
          >
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = "Input";
