"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  UserCheck,
  Search,
  Eye,
  CheckCircle2,
  XCircle,
  FileText,
  Shield,
  Video,
  ExternalLink,
  Lock,
  Unlock,
  ChevronRight,
  RefreshCw,
  X,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/api/client";
import { toastSuccess, toastError } from "@/lib/api/errors";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { VerificationStatusBadge } from "@/components/ui/StatusBadge";
import { CardSkeleton } from "@/components/ui/Skeleton";
import type {
  AdminVerificationItem,
  AdminVerificationQueueResponse,
  AdminDocumentUrlResponse,
  AdminLivenessDetails,
  VerificationRejectionReason,
} from "./adminTypes";

const REJECTION_REASONS: { code: VerificationRejectionReason; label: string; description: string }[] = [
  {
    code: "INVALID_DOCUMENT",
    label: "Invalid Document Type",
    description: "The uploaded file is not an official university identity card or government document.",
  },
  {
    code: "DOCUMENT_UNREADABLE",
    label: "Document Unreadable / Blurry",
    description: "The photo, name, or registration number is illegible due to poor resolution or glare.",
  },
  {
    code: "IDENTITY_MISMATCH",
    label: "Identity Data Mismatch",
    description: "Name or registration number on the document does not match student profile records.",
  },
  {
    code: "EXPIRED_DOCUMENT",
    label: "Expired Student Card",
    description: "The academic validity period or academic session indicated has expired.",
  },
  {
    code: "POOR_QUALITY",
    label: "Poor Image Quality",
    description: "Lighting, angle, or cropping makes verification inconclusive.",
  },
  {
    code: "SUSPECTED_FRAUD",
    label: "Suspected Fraud / Tampering",
    description: "Digital alterations, mismatched font, or counterfeit document detected.",
  },
];

export function VerificationQueue() {
  const queryClient = useQueryClient();
  const [selectedStatus, setSelectedStatus] = useState<string>("UNDER_REVIEW");
  const [searchTerm, setSearchTerm] = useState("");

  // Inspection Drawer State
  const [inspectingItem, setInspectingItem] = useState<AdminVerificationItem | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);

  // Sub-Dialogs
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectReasonCode, setRejectReasonCode] = useState<VerificationRejectionReason>("INVALID_DOCUMENT");
  const [rejectNotes, setRejectNotes] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  const [isSuspendOpen, setIsSuspendOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [isSuspending, setIsSuspending] = useState(false);

  const [isApproving, setIsApproving] = useState(false);
  const [isReactivating, setIsReactivating] = useState(false);

  // 1. Fetch Verification Queue
  const {
    data: queueData,
    isLoading,
    refetch,
  } = useQuery<AdminVerificationQueueResponse>({
    queryKey: ["admin-verifications", selectedStatus],
    queryFn: () => {
      const url =
        selectedStatus === "ALL"
          ? "/admin/verifications?limit=50"
          : `/admin/verifications?status=${selectedStatus}&limit=50`;
      return apiGet<AdminVerificationQueueResponse>(url);
    },
  });

  // 2. Fetch Forensic Liveness Details for Selected Item
  const {
    data: livenessDetails,
    isLoading: isLoadingLiveness,
  } = useQuery<AdminLivenessDetails>({
    queryKey: ["admin-liveness", inspectingItem?.id],
    queryFn: () =>
      apiGet<AdminLivenessDetails>(`/admin/verifications/${inspectingItem!.id}/liveness`),
    enabled: Boolean(inspectingItem?.id),
  });

  // Fetch Temporary Signed Document URL
  const handleFetchDocumentUrl = async (verificationId: string) => {
    setIsLoadingDoc(true);
    try {
      const res = await apiGet<AdminDocumentUrlResponse>(
        `/admin/verifications/${verificationId}/document/url`
      );
      setDocumentUrl(res.url);
      toastSuccess("Document URL Generated", `Temporary signed access token valid for 5 minutes.`);
    } catch (err) {
      toastError(err, "Failed to generate signed document URL");
    } finally {
      setIsLoadingDoc(false);
    }
  };

  // Open Inspection
  const handleInspect = (item: AdminVerificationItem) => {
    setInspectingItem(item);
    setDocumentUrl(null);
  };

  // Close Inspection
  const handleCloseInspect = () => {
    setInspectingItem(null);
    setDocumentUrl(null);
    setIsRejectOpen(false);
    setIsSuspendOpen(false);
  };

  // Action: Approve
  const handleApprove = async () => {
    if (!inspectingItem) return;
    setIsApproving(true);
    try {
      await apiPost(`/admin/verifications/${inspectingItem.id}/approve`);
      toastSuccess("Verification Approved", `${inspectingItem.studentName}'s account is now ACTIVE.`);
      queryClient.invalidateQueries({ queryKey: ["admin-verifications"] });
      handleCloseInspect();
    } catch (err) {
      toastError(err, "Failed to approve verification");
    } finally {
      setIsApproving(false);
    }
  };

  // Action: Reject
  const handleConfirmReject = async () => {
    if (!inspectingItem) return;
    setIsRejecting(true);
    try {
      await apiPost(`/admin/verifications/${inspectingItem.id}/reject`, {
        reasonCode: rejectReasonCode,
        notes: rejectNotes.trim() || undefined,
      });
      toastSuccess("Verification Rejected", `Decision recorded with code ${rejectReasonCode}.`);
      queryClient.invalidateQueries({ queryKey: ["admin-verifications"] });
      handleCloseInspect();
    } catch (err) {
      toastError(err, "Failed to reject verification");
    } finally {
      setIsRejecting(false);
    }
  };

  // Action: Suspend Student
  const handleConfirmSuspend = async () => {
    if (!inspectingItem) return;
    setIsSuspending(true);
    try {
      await apiPost(`/admin/students/${inspectingItem.studentProfileId}/suspend`, {
        reason: suspendReason.trim() || "Administrative security freeze",
      });
      toastSuccess("Student Suspended", "Account status transitioned to SUSPENDED. Ordering blocked.");
      queryClient.invalidateQueries({ queryKey: ["admin-verifications"] });
      handleCloseInspect();
    } catch (err) {
      toastError(err, "Failed to suspend student account");
    } finally {
      setIsSuspending(false);
    }
  };

  // Action: Reactivate Student
  const handleReactivate = async () => {
    if (!inspectingItem) return;
    setIsReactivating(true);
    try {
      await apiPost(`/admin/students/${inspectingItem.studentProfileId}/reactivate`);
      toastSuccess("Student Reactivated", "Account status restored to ACTIVE.");
      queryClient.invalidateQueries({ queryKey: ["admin-verifications"] });
      handleCloseInspect();
    } catch (err) {
      toastError(err, "Failed to reactivate student account");
    } finally {
      setIsReactivating(false);
    }
  };

  const filteredItems = useMemo(() => {
    const list = queueData?.data || [];
    if (!searchTerm.trim()) return list;
    const term = searchTerm.toLowerCase();
    return list.filter(
      (item) =>
        item.studentName?.toLowerCase().includes(term) ||
        item.universityRegNumber?.toLowerCase().includes(term) ||
        item.email?.toLowerCase().includes(term)
    );
  }, [queueData?.data, searchTerm]);

  const hasDocument = Boolean(inspectingItem?.document);
  const isLiveHumanPassed = Boolean(livenessDetails?.isLiveHuman);
  const dualPrerequisiteMet = hasDocument && isLiveHumanPassed;

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
              Verification Queue
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] tracking-tight mt-1">
            Student Identity &amp; Liveness Queue
          </h1>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Evaluate dual-prerequisite onboarding: authoritative identity document signature &amp; cryptographic liveness forensics.
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          leftIcon={<RefreshCw className="w-4 h-4" />}
        >
          Refresh Queue
        </Button>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] overflow-x-auto">
          {[
            { id: "UNDER_REVIEW", label: "Under Review" },
            { id: "PENDING_SUBMISSION", label: "Pending" },
            { id: "ACTIVE", label: "Approved" },
            { id: "REJECTED", label: "Rejected" },
            { id: "SUSPENDED", label: "Suspended" },
            { id: "ALL", label: "All Records" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedStatus(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                selectedStatus === tab.id
                  ? "bg-[var(--accent)] text-white shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--neutral-100)] dark:hover:bg-[var(--neutral-800)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="w-full md:w-72">
          <Input
            placeholder="Search name, reg #, email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>
      </div>

      {/* Verification Items List */}
      {isLoading ? (
        <div className="space-y-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : filteredItems.length === 0 ? (
        <Card className="p-12 text-center space-y-3">
          <UserCheck className="w-12 h-12 text-[var(--text-tertiary)] mx-auto" />
          <div className="text-base font-bold text-[var(--text-primary)]">
            No verification records found
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            No student verification records match the current status filter ({selectedStatus}).
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => (
            <Card
              key={item.id}
              className="p-4 sm:p-5 hover:border-[var(--brand-300)] transition-all cursor-pointer"
              onClick={() => handleInspect(item)}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-extrabold text-sm sm:text-base text-[var(--text-primary)]">
                      {item.studentName || "Unnamed Student"}
                    </span>
                    <VerificationStatusBadge status={item.status} size="sm" />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
                    <span>Reg #: <strong className="text-[var(--text-primary)] font-mono">{item.universityRegNumber}</strong></span>
                    <span>&bull;</span>
                    <span>{item.email}</span>
                    <span>&bull;</span>
                    <span>{item.phoneNumber}</span>
                  </div>
                  {item.rejectionReasonCode && (
                    <div className="text-[11px] text-[var(--danger)] font-medium">
                      Rejection Code: {item.rejectionReasonCode}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <span className="text-[11px] text-[var(--text-tertiary)]">
                    Submitted: {new Date(item.createdAt).toLocaleDateString()}
                  </span>
                  <Button
                    size="sm"
                    variant="primary"
                    rightIcon={<ChevronRight className="w-4 h-4" />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleInspect(item);
                    }}
                  >
                    Inspect
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* INSPECTION MODAL DRAWER */}
      {inspectingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-6">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-[var(--border-subtle)] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black text-[var(--text-primary)]">
                    {inspectingItem.studentName}
                  </h2>
                  <VerificationStatusBadge status={inspectingItem.status} />
                </div>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Reg #: <strong className="font-mono text-[var(--text-primary)]">{inspectingItem.universityRegNumber}</strong> &bull; {inspectingItem.email}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseInspect}
                className="p-2 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--neutral-100)] dark:hover:bg-[var(--neutral-800)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Dual-Prerequisite Invariant Verification Badge */}
            <div
              className={`p-4 rounded-2xl border text-xs flex items-center justify-between ${
                dualPrerequisiteMet
                  ? "bg-[var(--success-bg)] border-[var(--success)]/30 text-[var(--success)]"
                  : "bg-[var(--warning-bg)] border-[var(--warning)]/30 text-[var(--warning)]"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Shield className="w-5 h-5 shrink-0" />
                <div>
                  <div className="font-bold">Dual-Prerequisite Gate Status</div>
                  <div className="opacity-90">
                    Document Attached: <strong>{hasDocument ? "YES" : "MISSING"}</strong> &bull; Liveness Verified (isLiveHuman): <strong>{isLiveHumanPassed ? "YES" : "NO"}</strong>
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-mono uppercase font-bold tracking-wider px-2 py-1 rounded-md bg-white/20">
                {dualPrerequisiteMet ? "ELIGIBLE_FOR_APPROVAL" : "GATE_BLOCKED"}
              </span>
            </div>

            {/* Document Verification Section */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-sm text-[var(--text-primary)]">
                  <FileText className="w-4 h-4 text-[var(--accent)]" />
                  <span>Authoritative Identity Document</span>
                </div>
                {inspectingItem.document ? (
                  <span className="text-xs font-mono text-[var(--text-tertiary)]">
                    {(inspectingItem.document.fileSizeBytes / 1024).toFixed(1)} KB ({inspectingItem.document.fileMimeType})
                  </span>
                ) : (
                  <span className="text-xs text-[var(--danger)] font-semibold">No document uploaded</span>
                )}
              </div>

              {inspectingItem.document && (
                <div className="text-xs text-[var(--text-secondary)] space-y-2">
                  <div>Original Filename: <strong className="font-mono text-[var(--text-primary)]">{inspectingItem.document.originalFilename}</strong></div>

                  {documentUrl ? (
                    <div className="pt-2">
                      <a
                        href={documentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent)] hover:underline"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>Open Document in Secure Viewer (5-Min Signed URL)</span>
                      </a>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={isLoadingDoc}
                      onClick={() => handleFetchDocumentUrl(inspectingItem.id)}
                      leftIcon={<Eye className="w-4 h-4" />}
                    >
                      Request Signed Document URL
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Forensic Biometric Liveness Section */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-sm text-[var(--text-primary)]">
                  <Video className="w-4 h-4 text-purple-500" />
                  <span>Cryptographic Biometric Liveness Forensics</span>
                </div>
                {isLoadingLiveness ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-[var(--text-tertiary)]" />
                ) : livenessDetails ? (
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      livenessDetails.isLiveHuman
                        ? "bg-[var(--success-bg)] text-[var(--success)]"
                        : "bg-[var(--danger-bg)] text-[var(--danger)]"
                    }`}
                  >
                    {livenessDetails.isLiveHuman ? "LIVE_HUMAN" : "SPOOF_OR_INCONCLUSIVE"}
                  </span>
                ) : null}
              </div>

              {livenessDetails ? (
                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                      <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold">Blink Check</div>
                      <div className="font-bold text-[var(--text-primary)] mt-0.5">
                        {livenessDetails.naturalBlinkPassed ? "Passed" : "Failed"}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                      <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold">Head Turn L</div>
                      <div className="font-bold text-[var(--text-primary)] mt-0.5">
                        {livenessDetails.headTurnLeftPassed ? "Passed" : "Failed"}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                      <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold">Head Turn R</div>
                      <div className="font-bold text-[var(--text-primary)] mt-0.5">
                        {livenessDetails.headTurnRightPassed ? "Passed" : "Failed"}
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
                      <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-semibold">Confidence</div>
                      <div className="font-bold text-[var(--text-primary)] mt-0.5">
                        {(livenessDetails.confidenceScore * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  {livenessDetails.signedEvidenceUrl && (
                    <div className="pt-1">
                      <a
                        href={livenessDetails.signedEvidenceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-purple-600 hover:underline"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>Inspect Video Evidence (5-Min Signed URL)</span>
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-[var(--text-tertiary)]">
                  No forensic liveness record registered for this verification session.
                </div>
              )}
            </div>

            {/* Action Bar */}
            <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                {inspectingItem.status === "SUSPENDED" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={isReactivating}
                    onClick={handleReactivate}
                    leftIcon={<Unlock className="w-4 h-4 text-[var(--success)]" />}
                  >
                    Reactivate Account
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsSuspendOpen(true)}
                    leftIcon={<Lock className="w-4 h-4 text-[var(--warning)]" />}
                  >
                    Suspend Student
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsRejectOpen(true)}
                  leftIcon={<XCircle className="w-4 h-4 text-[var(--danger)]" />}
                >
                  Reject with Reason
                </Button>

                <Button
                  size="sm"
                  variant="primary"
                  loading={isApproving}
                  disabled={!dualPrerequisiteMet || isApproving}
                  onClick={handleApprove}
                  leftIcon={<CheckCircle2 className="w-4 h-4" />}
                >
                  Approve Verification
                </Button>
              </div>
            </div>

            {/* SUB-MODAL: REJECT VERIFICATION */}
            {isRejectOpen && (
              <div className="p-4 rounded-2xl bg-[var(--danger-bg)] border border-[var(--danger)]/30 space-y-4">
                <div className="font-bold text-sm text-[var(--danger)]">
                  Reject Student Verification
                </div>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                      Structured Rejection Reason Code (Authoritative)
                    </label>
                    <select
                      value={rejectReasonCode}
                      onChange={(e) => setRejectReasonCode(e.target.value as VerificationRejectionReason)}
                      className="w-full px-3 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)]"
                    >
                      {REJECTION_REASONS.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.label} ({r.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">
                      Reviewer Notes for Student (Optional)
                    </label>
                    <Input
                      placeholder="e.g. Please re-upload with clear lighting showing all four corners of ID card."
                      value={rejectNotes}
                      onChange={(e) => setRejectNotes(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setIsRejectOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    loading={isRejecting}
                    onClick={handleConfirmReject}
                    className="bg-[var(--danger)] text-white hover:bg-rose-700"
                  >
                    Confirm Rejection
                  </Button>
                </div>
              </div>
            )}

            {/* SUB-MODAL: SUSPEND STUDENT */}
            {isSuspendOpen && (
              <div className="p-4 rounded-2xl bg-[var(--warning-bg)] border border-[var(--warning)]/30 space-y-4">
                <div className="font-bold text-sm text-[var(--warning)]">
                  Administratively Suspend Student
                </div>
                <div className="text-xs space-y-2">
                  <label className="block text-[11px] font-semibold text-[var(--text-secondary)]">
                    Suspension Reason
                  </label>
                  <Input
                    placeholder="e.g. Suspected credential sharing or policy violation"
                    value={suspendReason}
                    onChange={(e) => setSuspendReason(e.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setIsSuspendOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    loading={isSuspending}
                    onClick={handleConfirmSuspend}
                  >
                    Confirm Suspension
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
