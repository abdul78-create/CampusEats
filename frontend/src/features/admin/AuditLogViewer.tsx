"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Lock,
  ShieldCheck,
  AlertTriangle,
  History,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/api/client";
import { toastSuccess, toastError } from "@/lib/api/errors";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CardSkeleton } from "@/components/ui/Skeleton";
import type { AuditLogsResponse, AuditChainVerificationResult, AuditLogRecord } from "./adminTypes";

export function AuditLogViewer() {
  const [page, setPage] = useState(1);
  const [isVerifyingChain, setIsVerifyingChain] = useState(false);
  const [chainResult, setChainResult] = useState<AuditChainVerificationResult | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const {
    data: auditData,
    isLoading,
    refetch,
  } = useQuery<AuditLogsResponse>({
    queryKey: ["admin-audit-logs", page],
    queryFn: () => apiGet<AuditLogsResponse>(`/admin/audit-logs?page=${page}&limit=15`),
  });

  const handleVerifyChain = async () => {
    setIsVerifyingChain(true);
    try {
      const result = await apiPost<AuditChainVerificationResult>("/admin/audit/verify-chain");
      setChainResult(result);
      if (result.isValid) {
        toastSuccess(
          "SHA-256 Hash Chain Verified",
          `All ${result.totalRecordsChecked} records verified without sequence breaks or hash discrepancies.`
        );
      } else {
        toastError(
          `Integrity compromise detected at sequence #${result.brokenSequenceNumber || "?"}`
        );
      }
    } catch (err) {
      toastError(err, "Failed to verify audit chain");
    } finally {
      setIsVerifyingChain(false);
    }
  };

  const logs = auditData?.data || [];
  const meta = auditData?.meta;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin"
              className="text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Admin Command
            </Link>
            <span className="text-[var(--text-tertiary)]">/</span>
            <span className="text-xs font-semibold text-[var(--accent-text)]">
              Audit Logs
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] tracking-tight mt-1">
            Cryptographic Audit Ledger &amp; Hash Chain
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Immutable SHA-256 genesis-anchored audit trail protecting identity verifications, orders, and settlements.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Refresh
          </Button>

          <Button
            size="sm"
            variant="primary"
            loading={isVerifyingChain}
            onClick={handleVerifyChain}
            leftIcon={<Lock className="w-4 h-4" />}
          >
            Verify Hash Chain
          </Button>
        </div>
      </div>

      {/* Verification Result Callout */}
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
                  ? "Cryptographic Verification Confirmed (SHA-256)"
                  : "Hash Chain Verification Failure"}
              </div>
              <div className="opacity-90">
                {chainResult.isValid
                  ? `Verified ${chainResult.totalRecordsChecked} records from genesis block. Zero payload alterations or deleted sequences.`
                  : `Chain verification halted at sequence #${chainResult.brokenSequenceNumber}: ${chainResult.errorDetails}`}
              </div>
            </div>
          </div>
          <span className="text-[10px] font-mono uppercase font-bold tracking-wider px-2 py-1 rounded-md bg-white/20">
            {chainResult.isValid ? "CHAIN_VERIFIED" : "BROKEN_CHAIN"}
          </span>
        </div>
      )}

      {/* Logs Table / Cards */}
      {isLoading ? (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : logs.length === 0 ? (
        <Card className="p-12 text-center space-y-3">
          <History className="w-12 h-12 text-[var(--text-tertiary)] mx-auto" />
          <div className="text-base font-bold text-[var(--text-primary)]">
            No audit records found
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            The cryptographic ledger is currently empty.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {logs.map((log: AuditLogRecord) => {
            const isExpanded = expandedLogId === log.id;
            return (
              <Card key={log.id} className="p-4 sm:p-5 transition-all">
                <div
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer"
                  onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-base)] border border-[var(--border-subtle)] font-mono text-xs font-bold text-[var(--accent-text)]">
                      #{log.sequenceNumber}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-extrabold text-sm text-[var(--text-primary)] font-mono">
                          {log.actionType}
                        </span>
                        <span className="text-xs text-[var(--text-tertiary)]">&bull;</span>
                        <span className="text-xs text-[var(--text-secondary)]">
                          {log.targetEntity}: <strong className="font-mono text-[var(--text-primary)]">{log.targetId.slice(0, 12)}...</strong>
                        </span>
                      </div>
                      {log.reason && (
                        <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                          {log.reason}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center text-xs text-[var(--text-tertiary)]">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </div>

                {/* Cryptographic Hash Details (Expandable) */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] space-y-3 text-xs bg-[var(--bg-base)] p-3.5 rounded-xl animate-in fade-in duration-150">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-[var(--text-tertiary)] block mb-0.5">
                          Previous Hash
                        </span>
                        <span className="font-mono text-[11px] text-[var(--text-secondary)] break-all select-all">
                          {log.previousHash}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-[var(--text-tertiary)] block mb-0.5">
                          Current Hash (SHA-256)
                        </span>
                        <span className="font-mono text-[11px] text-[var(--accent-text)] font-semibold break-all select-all">
                          {log.currentHash}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-[var(--text-secondary)] pt-2 border-t border-[var(--border-subtle)]/50">
                      <div>
                        Actor: <strong className="font-mono text-[var(--text-primary)]">{log.actorId}</strong>
                      </div>
                      <div>
                        Timestamp: <strong className="font-mono text-[var(--text-primary)]">{log.timestamp}</strong>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-[var(--text-secondary)]">
            Page {meta.page} of {meta.totalPages} ({meta.total} records)
          </span>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              leftIcon={<ChevronLeft className="w-4 h-4" />}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
              rightIcon={<ChevronRight className="w-4 h-4" />}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
