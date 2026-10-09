"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldCheck,
  FileText,
  Camera,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { apiGet } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";
import { VerificationStatusBadge } from "@/components/ui/StatusBadge";
import { CardSkeleton } from "@/components/ui/Skeleton";
import type { VerificationStatusResponse } from "@/types/api";

export function VerificationStatusCard() {
  const {
    data: status,
    isLoading,
    isError,
    refetch,
  } = useQuery<VerificationStatusResponse>({
    queryKey: ["student", "verification-status"],
    queryFn: () => apiGet<VerificationStatusResponse>("/student/verification/status"),
  });

  if (isLoading) {
    return <CardSkeleton />;
  }

  if (isError || !status) {
    return (
      <Card className="border-[var(--danger)]/30">
        <CardContent className="p-6 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-[var(--danger)] mx-auto" />
          <div className="text-sm font-semibold text-[var(--text-primary)]">
            Could not retrieve verification status
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Please check your connection and try again.
          </p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isLivenessDone =
    status.livenessVerification?.hasCompletedLiveness &&
    status.livenessVerification?.isLiveHuman;

  return (
    <Card className="w-full shadow-[var(--shadow-md)]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-lg">Student Verification State</CardTitle>
              <CardDescription>
                University identity &amp; biometric anti-spoofing status
              </CardDescription>
            </div>
          </div>
          <VerificationStatusBadge status={status.status} />
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Ordering Eligibility Banner */}
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs ${
            status.isEligibleToOrder
              ? "bg-[var(--success-bg)] border-[var(--success)]/20 text-[var(--success)]"
              : "bg-[var(--warning-bg)] border-[var(--warning)]/20 text-[var(--warning)]"
          }`}
        >
          <div className="flex items-center gap-2">
            {status.isEligibleToOrder ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <Clock className="w-4 h-4 shrink-0" />
            )}
            <span className="font-semibold">
              {status.isEligibleToOrder
                ? "Eligible for Campus Food Ordering"
                : "Ordering Ineligible — Verification Prerequisites Incomplete"}
            </span>
          </div>
        </div>

        {/* Dual-Prerequisites Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Prerequisite 1: Identity Document */}
          <div className="p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[var(--text-secondary)]" />
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  1. Identity Document
                </span>
              </div>
              {status.submittedAt ? (
                <span className="text-[11px] font-semibold text-[var(--success)]">
                  Submitted
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-[var(--warning)]">
                  Missing
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Official university ID or enrollment record for administrator review.
            </p>
          </div>

          {/* Prerequisite 2: Active Liveness */}
          <div className="p-4 rounded-xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-[var(--text-secondary)]" />
                <span className="text-xs font-semibold text-[var(--text-primary)]">
                  2. Liveness Check
                </span>
              </div>
              {isLivenessDone ? (
                <span className="text-[11px] font-semibold text-[var(--success)]">
                  Live Human Verified
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-[var(--warning)]">
                  Pending
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Certified temporal video challenge to prevent spoofing and bot accounts.
            </p>
          </div>
        </div>

        {/* Rejection notice if present */}
        {status.status === "REJECTED" && status.rejectionReason && (
          <div className="p-4 rounded-xl bg-[var(--danger-bg)] border border-[var(--danger)]/20 text-xs text-[var(--danger)] flex items-start gap-2.5">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Verification was rejected:</div>
              <p className="mt-1 leading-relaxed">{status.rejectionReason}</p>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-col sm:flex-row justify-end gap-2.5">
        {!status.submittedAt && (
          <Link href="/student/verification" className="w-full sm:w-auto">
            <Button size="sm" variant="outline" className="w-full">
              Upload Document
            </Button>
          </Link>
        )}
        {!isLivenessDone && (
          <Link href="/student/liveness" className="w-full sm:w-auto">
            <Button size="sm" variant="primary" rightIcon={<ArrowRight className="w-4 h-4" />} className="w-full">
              Complete Liveness Challenge
            </Button>
          </Link>
        )}
      </CardFooter>
    </Card>
  );
}
