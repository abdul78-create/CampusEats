"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  FileCheck2,
  CheckCircle2,
} from "lucide-react";
import { apiPost } from "@/lib/api/client";
import { toastSuccess, toastError } from "@/lib/api/errors";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import type { AdminRefundResponse } from "./adminTypes";

export function AdminRefundManager() {
  const [subOrderId, setSubOrderId] = useState("");
  const [reason, setReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [refundResult, setRefundResult] = useState<AdminRefundResponse | null>(null);

  const handleProcessRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subOrderId.trim()) {
      toastError("Please enter a valid Sub-Order UUID.");
      return;
    }
    if (!reason.trim() || reason.trim().length < 3) {
      toastError("Please provide a refund reason (min 3 characters).");
      return;
    }

    setIsProcessing(true);
    setRefundResult(null);
    try {
      const res = await apiPost<AdminRefundResponse>(
        `/admin/refunds/${subOrderId.trim()}`,
        { reason: reason.trim() }
      );
      setRefundResult(res);
      toastSuccess(
        "Refund Processed",
        `Isolated refund of ₹${res.refundAmount.toFixed(2)} recorded.`
      );
      setReason("");
    } catch (err) {
      toastError(err, "Failed to process administrative refund");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      {/* Header */}
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
            Refunds
          </span>
        </div>
        <h1 className="text-xl sm:text-2xl font-black text-[var(--text-primary)] tracking-tight mt-1">
          Administrative Isolated Refund Console
        </h1>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
          Process administrative refunds for REJECTED or CANCELLED sub-orders with immutable ledger records.
        </p>
      </div>

      {/* Refund Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Execute Sub-Order Refund</CardTitle>
          <CardDescription>
            Target sub-order must be in REJECTED or CANCELLED status. Processing does not disrupt other stalls in the master order.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleProcessRefund}>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[var(--text-primary)] mb-1">
                Sub-Order UUID
              </label>
              <Input
                placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                value={subOrderId}
                onChange={(e) => setSubOrderId(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--text-primary)] mb-1">
                Administrative Refund Reason
              </label>
              <Input
                placeholder="e.g. Customer dispute resolved / Kitchen inventory shortage"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>

            {/* Refund Success Callout */}
            {refundResult && (
              <div className="p-4 rounded-2xl bg-[var(--success-bg)] border border-[var(--success)]/30 text-xs text-[var(--success)] space-y-1 animate-in fade-in">
                <div className="flex items-center gap-2 font-bold">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Refund Successfully Processed</span>
                </div>
                <div className="text-[11px] opacity-90">
                  Refund ID: <strong className="font-mono text-[var(--text-primary)]">{refundResult.refundId}</strong>
                </div>
                <div className="text-[11px] opacity-90">
                  Amount Refunded: <strong className="text-[var(--text-primary)]">₹{refundResult.refundAmount.toFixed(2)}</strong>
                </div>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-end pt-2 border-t border-[var(--border-subtle)]">
            <Button
              type="submit"
              variant="primary"
              size="md"
              loading={isProcessing}
              leftIcon={<FileCheck2 className="w-4 h-4" />}
            >
              Process Isolated Refund
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
