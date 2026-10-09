import Link from "next/link";
import { UtensilsCrossed, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="flex-1 flex items-center justify-center p-6 bg-[var(--bg-base)] text-[var(--text-primary)]"
    >
      <div className="w-full max-w-md p-8 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-[var(--shadow-lg)] text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] mb-5">
          <UtensilsCrossed className="w-7 h-7" aria-hidden="true" />
        </div>

        <div className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider bg-[var(--brand-100)] dark:bg-[var(--brand-900)] text-[var(--brand-800)] dark:text-[var(--brand-200)] mb-3">
          404 Not Found
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] mb-2">
          Page not found
        </h1>

        <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
          The stall, menu, or page you were looking for doesn&apos;t exist or may have been moved.
        </p>

        <Link
          href="/"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-medium transition-colors shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Back to CampusEats
        </Link>
      </div>
    </main>
  );
}
