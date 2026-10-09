"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log non-sensitive error details in dev; never expose stack traces to users
    if (process.env.NODE_ENV !== "production") {
      console.error("[CampusEats UI Error Boundary]", error);
    }
  }, [error]);

  return (
    <main
      id="main-content"
      className="flex-1 flex items-center justify-center p-6 bg-[var(--bg-base)] text-[var(--text-primary)]"
      role="alert"
      aria-live="assertive"
    >
      <div className="w-full max-w-md p-8 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-[var(--shadow-lg)] text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--danger-bg)] text-[var(--danger)] mb-5">
          <AlertTriangle className="w-7 h-7" aria-hidden="true" />
        </div>

        <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)] mb-2">
          Something went wrong
        </h1>

        <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
          An unexpected error occurred while loading this page. Your data and active orders remain secure.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Try again
          </button>

          <Link
            href="/"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--neutral-100)] dark:bg-[var(--neutral-800)] hover:bg-[var(--neutral-200)] dark:hover:bg-[var(--neutral-700)] text-[var(--text-primary)] text-sm font-medium transition-colors border border-[var(--border-subtle)]"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            Return Home
          </Link>
        </div>
      </div>
    </main>
  );
}
