"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldCheck,
  UserCheck,
  FileCheck2,
  Clock,
  History,
  Lock,
  ArrowRight,
  ShieldAlert,
  AlertTriangle,
  Sliders,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/api/client";
import { toastSuccess, toastError } from "@/lib/api/errors";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/features/auth/useAuth";
import type {
  AdminVerificationQueueResponse,
  AuditChainVerificationResult,
  AuditLogsResponse,
} from "./adminTypes";

export function AdminDashboard() {
  const { user } = useAuth();
  const [isVerifyingChain, setIsVerifyingChain] = React.useState(false);
  const [chainResult, setChainResult] = React.useState<AuditChainVerificationResult | null>(null);

  // 1. Fetch Verification Queue (Pending Reviews)
  const {
    data: pendingVerifications,
    isLoading: isLoadingQueue,
  } = useQuery<AdminVerificationQueueResponse>({
    queryKey: ["admin-verifications-pending"],
    queryFn: () =>
      apiGet<AdminVerificationQueueResponse>("/admin/verifications?status=UNDER_REVIEW&limit=5"),
  });

  // 2. Fetch Recent Audit Logs
  const {
    data: auditLogs,
    isLoading: isLoadingAudit,
  } = useQuery<AuditLogsResponse>({
    queryKey: ["admin-audit-recent"],
    queryFn: () => apiGet<AuditLogsResponse>("/admin/audit-logs?limit=5"),
  });

  // Verify SHA-256 Hash Chain
  const handleVerifyChain = async () => {
    setIsVerifyingChain(true);
    try {
      const result = await apiPost<AuditChainVerificationResult>("/admin/audit/verify-chain");
      setChainResult(result);
      if (result.isValid) {
        toastSuccess(
          "Audit Chain Verified",
          `All ${result.totalRecordsChecked} records verified with unbroken SHA-256 hash sequence.`
        );
      } else {
        toastError(
          `Audit chain verification failure at sequence #${result.brokenSequenceNumber || "?"}`
        );
      }
    } catch (err) {
      toastError(err, "Failed to verify audit hash chain");
    } finally {
      setIsVerifyingChain(false);
    }
  };

  // Authorization Shield (UX Protection; backend security handles real boundary)
  if (user && user.role !== "ADMIN" && (user.role as string) !== "SUPER_ADMIN") {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-[var(--danger-bg)] text-[var(--danger)] flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-[var(--text-primary)]">
          Administrator Access Required
        </h2>
        <p className="text-xs text-[var(--text-secondary)]">
          You do not have permissions to access the CampusEats administrative command center.
        </p>
        <Link href="/">
          <Button size="sm" variant="primary">
            Return to CampusEats
          </Button>
        </Link>
      </div>
    );
  }

  if (isLoadingQueue || isLoadingAudit) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div className="h-10 w-48 bg-[var(--neutral-200)] dark:bg-[var(--neutral-800)] rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  const pendingCount = pendingVerifications?.pagination?.total ?? 0;
  const auditTotalCount = auditLogs?.meta?.total ?? 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 sm:p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[var(--accent)] text-white flex items-center justify-center font-bold shadow-md shadow-[var(--brand-500)]/20 shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] tracking-tight">
              Administrative Command Center
            </h1>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Identity verification queue, cryptographic audit hash chains, and campus dining policy controls.
            </p>
          </div>
        </div>

        {/* Cryptographic Chain Quick Action */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            loading={isVerifyingChain}
            onClick={handleVerifyChain}
            leftIcon={<Lock className="w-4 h-4 text-[var(--success)]" />}
          >
            Verify SHA-256 Chain
          </Button>
        </div>
      </div>

      {/* Chain Status Callout Banner */}
      {chainResult && (
        <div
          className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-4 ${
            chainResult.isValid
              ? "bg-[var(--success-bg)] border-[var(--success)]/30 text-[var(--success)]"
              : "bg-[var(--danger-bg)] border-[var(--danger)]/30 text-[var(--danger)]"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {chainResult.isValid ? (
              <ShieldCheck className="w-5 h-5 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 shrink-0" />
            )}
            <div>
              <div className="font-bold">
                {chainResult.isValid
                  ? "Cryptographic Hash Chain Verified (SHA-256)"
                  : "Chain Tamper Detected"}
              </div>
              <div className="opacity-90">
                {chainResult.isValid
                  ? `All ${chainResult.totalRecordsChecked} sequential audit records intact with unbroken genesis anchoring.`
                  : `Integrity broken at sequence #${chainResult.brokenSequenceNumber}: ${chainResult.errorDetails}`}
              </div>
            </div>
          </div>
          <span className="text-[10px] font-mono uppercase font-bold tracking-wider px-2 py-1 rounded-md bg-white/20">
            {chainResult.isValid ? "CHAIN_VALID" : "CHAIN_TAMPERED"}
          </span>
        </div>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pending Verifications */}
        <Card className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">
              Pending Reviews
            </span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl sm:text-3xl font-black text-[var(--text-primary)]">
              {pendingCount}
            </div>
            <div className="text-[11px] text-[var(--text-tertiary)] mt-1">
              Dual-prerequisite student verifications
            </div>
          </div>
        </Card>

        {/* Audit Ledger Records */}
        <Card className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">
              Audit Records
            </span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
              <History className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl sm:text-3xl font-black text-[var(--text-primary)]">
              {auditTotalCount}
            </div>
            <div className="text-[11px] text-[var(--text-tertiary)] mt-1">
              Cryptographically chained events
            </div>
          </div>
        </Card>

        {/* Operating Hours Policy */}
        <Card className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">
              Operating Schedule
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl sm:text-3xl font-black text-[var(--text-primary)]">
              Active
            </div>
            <div className="text-[11px] text-[var(--text-tertiary)] mt-1">
              Official campus dining hours policy
            </div>
          </div>
        </Card>

        {/* Administrative Refunds */}
        <Card className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-secondary)]">
              Refund Control
            </span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500">
              <FileCheck2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl sm:text-3xl font-black text-[var(--text-primary)]">
              Isolated
            </div>
            <div className="text-[11px] text-[var(--text-tertiary)] mt-1">
              Zero cross-stall settlement impact
            </div>
          </div>
        </Card>
      </div>

      {/* Main Administrative Portals Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Portal 1: Verification Queue */}
        <Card className="hover:border-[var(--brand-300)] transition-all">
          <CardHeader>
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center mb-2">
              <UserCheck className="w-5 h-5" />
            </div>
            <CardTitle>Student Verification Queue</CardTitle>
            <CardDescription>
              Review uploaded student ID documents with temporary signed URLs and forensic liveness evaluations.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Link href="/admin/verifications">
              <Button variant="primary" className="w-full justify-between" rightIcon={<ArrowRight className="w-4 h-4" />}>
                Open Queue ({pendingCount})
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Portal 2: Audit Logs & Cryptographic Chain */}
        <Card className="hover:border-[var(--brand-300)] transition-all">
          <CardHeader>
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mb-2">
              <Lock className="w-5 h-5" />
            </div>
            <CardTitle>Cryptographic Audit Ledger</CardTitle>
            <CardDescription>
              Inspect immutable SHA-256 hashed audit events, genesis blocks, and verify chain integrity.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Link href="/admin/audit">
              <Button variant="outline" className="w-full justify-between" rightIcon={<ArrowRight className="w-4 h-4" />}>
                Inspect Chain
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Portal 3: Operating Hours Policy */}
        <Card className="hover:border-[var(--brand-300)] transition-all">
          <CardHeader>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-2">
              <Sliders className="w-5 h-5" />
            </div>
            <CardTitle>Operating Hours Policy</CardTitle>
            <CardDescription>
              Configure official 7-day operating hours schedules per stall, enforcing campus schedule boundaries.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Link href="/admin/operating-hours">
              <Button variant="outline" className="w-full justify-between" rightIcon={<ArrowRight className="w-4 h-4" />}>
                Manage Schedule
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Portal 4: Administrative Refunds */}
        <Card className="hover:border-[var(--brand-300)] transition-all">
          <CardHeader>
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center mb-2">
              <FileCheck2 className="w-5 h-5" />
            </div>
            <CardTitle>Refund Console</CardTitle>
            <CardDescription>
              Process isolated refunds for cancelled or rejected sub-orders with zero cross-stall disruption.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Link href="/admin/refunds">
              <Button variant="outline" className="w-full justify-between" rightIcon={<ArrowRight className="w-4 h-4" />}>
                Process Refund
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
