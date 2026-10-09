"use client";

import Link from "next/link";
import {
  Clock,
  ShieldCheck,
  Zap,
  Activity,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Palette,
} from "lucide-react";
import {
  FadeUp,
  StaggerContainer,
  StaggerItem,
} from "@/components/motion/MotionPrimitives";
import { Navbar } from "@/components/ui/Navbar";
import { Button } from "@/components/ui/Button";

const FOUNDATION_MODULES = [
  {
    icon: ShieldCheck,
    title: "Backend-Authoritative Security",
    desc: "Strict adherence to Phase 0–7 invariants: zero client trust for pricing, state machines, ledger entries, or liveness.",
    badge: "Phases 0–7 Locked",
  },
  {
    icon: Clock,
    title: "Scheduled Pickup Engine",
    desc: "Backend capacity-checked pickup slot negotiation with next-feasible-slot recovery and no client-side slot fabrication.",
    badge: "Capacity Aware",
  },
  {
    icon: Activity,
    title: "Realtime SSE Pipeline",
    desc: "Low-overhead Server-Sent Events with reconnect handling, Last-Event-ID replay, and out-of-band resync.",
    badge: "Phase 6 Realtime",
  },
  {
    icon: Zap,
    title: "Centralized Motion System",
    desc: "GPU-accelerated transforms, spring physics, and full prefers-reduced-motion accessibility compliance.",
    badge: "Framer Motion",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-base)] text-[var(--text-primary)]">
      {/* Skip to main content for keyboard screen-reader navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 z-50 px-4 py-2 bg-[var(--accent)] text-white rounded-md shadow-md text-sm font-medium"
      >
        Skip to main content
      </a>

      {/* Global Navigation Header */}
      <Navbar />

      {/* Main Content Area */}
      <main id="main-content" className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-12 sm:py-20">
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto mb-16">
          {/* Phase Badge */}
          <FadeUp delay={0.05}>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[var(--accent-subtle)] border border-[var(--brand-300)]/30 text-[var(--accent-text)] text-xs font-semibold mb-6">
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" aria-hidden="true" />
              <span>Phase F1: Design System Ready</span>
            </div>
          </FadeUp>

          {/* Hero Heading */}
          <FadeUp delay={0.1}>
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[var(--text-primary)] leading-[1.15] mb-5">
              Scheduled Dining for <br />
              <span className="bg-gradient-to-r from-[var(--brand-500)] to-[var(--brand-700)] bg-clip-text text-transparent">
                Every Campus Corner
              </span>
            </h1>
          </FadeUp>

          {/* Subheading */}
          <FadeUp delay={0.15}>
            <p className="text-base sm:text-lg text-[var(--text-secondary)] leading-relaxed max-w-2xl mb-8">
              Order ahead, schedule guaranteed pickup windows, and skip the line at campus food stalls.
              Production-grade architecture with real-time SSE updates and secure identity verification.
            </p>
          </FadeUp>

          {/* Primary Action Buttons */}
          <FadeUp delay={0.2} className="flex flex-wrap items-center justify-center gap-4 mb-10">
            <Link href="/design-system">
              <Button size="lg" variant="primary" leftIcon={<Palette className="w-5 h-5" />} rightIcon={<ArrowRight className="w-4 h-4" />}>
                Explore Design System
              </Button>
            </Link>
          </FadeUp>

          {/* CTAs / System Status Badges */}
          <FadeUp delay={0.25}>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-[var(--shadow-sm)] text-xs font-medium text-[var(--text-secondary)]">
                <CheckCircle2 className="w-4 h-4 text-[var(--success)]" aria-hidden="true" />
                <span>Next.js 15 App Router</span>
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-[var(--shadow-sm)] text-xs font-medium text-[var(--text-secondary)]">
                <CheckCircle2 className="w-4 h-4 text-[var(--success)]" aria-hidden="true" />
                <span>Tailwind CSS v4 + Design Tokens</span>
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-[var(--shadow-sm)] text-xs font-medium text-[var(--text-secondary)]">
                <CheckCircle2 className="w-4 h-4 text-[var(--success)]" aria-hidden="true" />
                <span>TanStack Query &amp; Axios Client</span>
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-[var(--shadow-sm)] text-xs font-medium text-[var(--text-secondary)]">
                <CheckCircle2 className="w-4 h-4 text-[var(--success)]" aria-hidden="true" />
                <span>Centralized Motion System</span>
              </div>
            </div>
          </FadeUp>
        </div>

        {/* Feature Grid with Staggered Motion */}
        <StaggerContainer className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-4xl mx-auto">
          {FOUNDATION_MODULES.map((module) => {
            const Icon = module.icon;
            return (
              <StaggerItem key={module.title}>
                <div className="h-full p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-[var(--shadow-xs)] hover:shadow-[var(--shadow-md)] transition-shadow duration-200 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center">
                        <Icon className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[var(--neutral-100)] dark:bg-[var(--neutral-700)] text-[var(--text-secondary)]">
                        {module.badge}
                      </span>
                    </div>
                    <h2 className="text-base font-semibold text-[var(--text-primary)] mb-2">
                      {module.title}
                    </h2>
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                      {module.desc}
                    </p>
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </StaggerContainer>

        {/* Next Phase Indicator */}
        <FadeUp delay={0.3} className="mt-14 max-w-xl mx-auto text-center">
          <Link
            href="/design-system"
            className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] flex items-center justify-between hover:border-[var(--border-default)] transition-colors group block"
          >
            <span className="font-medium text-[var(--text-primary)]">Phase F1 Design System Ready</span>
            <span className="inline-flex items-center gap-1 text-[var(--accent)] font-semibold group-hover:translate-x-0.5 transition-transform">
              View All Components
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
          </Link>
        </FadeUp>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] py-6 text-center text-xs text-[var(--text-tertiary)]">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>CampusEats &copy; 2026. Production-Grade UI + Motion Architecture.</span>
          <span>Zero Client Trust &bull; Authoritative Backend Verification</span>
        </div>
      </footer>
    </div>
  );
}
