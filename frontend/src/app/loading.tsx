import React from "react";
import { Utensils } from "lucide-react";

export default function RootLoading() {
  return (
    <div
      role="status"
      aria-label="Loading CampusEats..."
      className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center"
    >
      <div className="relative flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--accent)] text-white shadow-lg shadow-[var(--brand-500)]/25 mb-4 animate-pulse">
        <Utensils className="w-7 h-7" aria-hidden="true" />
      </div>

      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce [animation-delay:-0.3s]" />
        <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce [animation-delay:-0.15s]" />
        <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-bounce" />
      </div>

      <span className="sr-only">Loading content, please wait...</span>
    </div>
  );
}
