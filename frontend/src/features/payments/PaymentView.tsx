"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import {
  Smartphone,
  Clock,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";
import { apiGet, apiPost } from "@/lib/api/client";
import { toastSuccess, toastError } from "@/lib/api/errors";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";
import { PaymentStatusBadge } from "@/components/ui/StatusBadge";
import type { PaymentStatus } from "@/types/api";

interface PaymentViewProps {
  orderId: string;
}

interface PaymentInitiationData {
  providerReference: string;
  paymentAttemptReference: string;
  intentPayload: string;
  qrPayload: string;
  expiresAt: string;
}

interface OrderPaymentStatusData {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  totalAmount: number;
  advancePercentage: number;
  advanceAmount: number;
  remainingAmount: number;
  amountPaid: number;
  payment: {
    id: string;
    status: PaymentStatus;
    amountPaid: number;
    amountRemaining: number;
    verifiedAt?: string | null;
    transactions?: Array<{
      id: string;
      transactionType: string;
      amount: number;
      status: PaymentStatus;
      providerTransactionId?: string;
      expiresAt?: string;
      createdAt: string;
    }>;
  } | null;
}

export function PaymentView({ orderId }: PaymentViewProps) {
  const router = useRouter();

  // Authoritative Order & Payment Data
  const [orderData, setOrderData] = useState<OrderPaymentStatusData | null>(null);
  const [initiationData, setInitiationData] = useState<PaymentInitiationData | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);

  // Status & Timing
  const [status, setStatus] = useState<PaymentStatus>("INITIATED");
  const [isInitiating, setIsInitiating] = useState(true);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(900); // 15 min TTL
  const [copiedUpi, setCopiedUpi] = useState(false);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // STEP 1: Fetch Authoritative Status from Backend
  const checkStatus = useCallback(async () => {
    setIsCheckingStatus(true);
    try {
      const res = await apiGet<OrderPaymentStatusData>(`/payments/order/${orderId}`);
      if (res) {
        setOrderData(res);
        const currentPaymentStatus = res.payment?.status;
        const currentOrderStatus = res.orderStatus;

        if (currentPaymentStatus === "SUCCESS" || currentOrderStatus === "CONFIRMED") {
          setStatus("SUCCESS");
          if (pollingRef.current) clearInterval(pollingRef.current);
          toastSuccess("Payment confirmed", "Your advance deposit was verified by the bank.");
          router.push(`/orders/${orderId}/confirmed`);
          return;
        }

        if (currentPaymentStatus === "FAILED" || currentOrderStatus === "PAYMENT_FAILED") {
          setStatus("FAILED");
          if (pollingRef.current) clearInterval(pollingRef.current);
          return;
        }

        if (currentPaymentStatus === "EXPIRED" || currentOrderStatus === "EXPIRED") {
          setStatus("EXPIRED");
          if (pollingRef.current) clearInterval(pollingRef.current);
          return;
        }

        if (currentPaymentStatus) {
          setStatus(currentPaymentStatus);
        }
      }
    } catch {
      // Non-fatal polling blip; continue polling
    } finally {
      setIsCheckingStatus(false);
    }
  }, [orderId, router]);

  // STEP 2: Initiate Advance Payment Session via Backend
  const initiatePayment = useCallback(async () => {
    setIsInitiating(true);
    setErrorMsg(null);
    setQrSvg(null);

    try {
      // First check if already paid
      const existing = await apiGet<OrderPaymentStatusData>(`/payments/order/${orderId}`);
      setOrderData(existing);

      if (existing.payment?.status === "SUCCESS" || existing.orderStatus === "CONFIRMED") {
        setStatus("SUCCESS");
        toastSuccess("Already paid", "This order advance is already confirmed.");
        router.push(`/orders/${orderId}/confirmed`);
        return;
      }

      // Initiate fresh or resume active payment attempt
      const data = await apiPost<PaymentInitiationData>("/payments/initiate", {
        orderId,
        idempotencyKey: crypto.randomUUID(),
      });

      setInitiationData(data);
      setStatus("INITIATED");

      // Generate real vector SVG QR code from authoritative qrPayload
      if (data.qrPayload) {
        const svg = await QRCode.toString(data.qrPayload, {
          type: "svg",
          margin: 1,
          width: 220,
          color: {
            dark: "#0f172a",
            light: "#ffffff",
          },
        });
        setQrSvg(svg);
      }

      // Compute TTL countdown against server expiration
      if (data.expiresAt) {
        const remaining = Math.max(
          0,
          Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000)
        );
        setSecondsLeft(remaining);
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { error?: { message?: string } } } })
              ?.response?.data?.error?.message
          : "Could not initiate payment session.";
      setErrorMsg(msg || "Payment initiation failed.");
      toastError(err, "Payment initiation failed");
    } finally {
      setIsInitiating(false);
    }
  }, [orderId, router]);

  // Initial Load
  useEffect(() => {
    let mounted = true;
    const timer = setTimeout(() => {
      if (mounted) {
        initiatePayment();
      }
    }, 0);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [initiatePayment]);

  // STEP 3: Timer Countdown based on Server TTL
  useEffect(() => {
    if (status !== "INITIATED" || secondsLeft <= 0) return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Check authoritative status before declaring expired
          checkStatus();
          setStatus("EXPIRED");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status, secondsLeft, checkStatus]);

  // STEP 4: Authoritative Realtime Polling (Every 3s)
  useEffect(() => {
    if (status === "INITIATED") {
      pollingRef.current = setInterval(checkStatus, 3000);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [status, checkStatus]);

  const copyUpiId = () => {
    navigator.clipboard.writeText("campuseats@upi");
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const advanceAmount = orderData?.advanceAmount ?? 0;

  return (
    <Card className="max-w-md mx-auto shadow-[var(--shadow-xl)] border-[var(--border-subtle)]">
      <CardHeader className="text-center pb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-[var(--text-tertiary)]">
            ORDER #{orderData?.orderNumber || orderId.slice(0, 8).toUpperCase()}
          </span>
          <PaymentStatusBadge status={status} size="sm" />
        </div>
        <CardTitle className="text-2xl">Advance UPI Deposit</CardTitle>
        <CardDescription>
          Pay authoritative advance deposit to release sub-orders to the kitchen queue
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Payable Advance Display */}
        <div className="p-4 rounded-2xl bg-[var(--accent-subtle)] border border-[var(--brand-300)]/40 text-center">
          <div className="text-xs uppercase font-semibold text-[var(--accent-text)] mb-1">
            Payable Now ({orderData?.advancePercentage ?? 50}% Advance)
          </div>
          <div className="text-3xl font-extrabold text-[var(--text-primary)]">
            ₹{advanceAmount > 0 ? advanceAmount.toFixed(2) : "—"}
          </div>
          {orderData?.remainingAmount ? (
            <div className="text-[11px] text-[var(--text-secondary)] mt-1">
              Remaining balance of ₹{orderData.remainingAmount.toFixed(2)} due at counter collection
            </div>
          ) : null}
        </div>

        {/* State 1: INITIATED / Active Session */}
        {status === "INITIATED" && (
          <div className="space-y-5">
            {/* Server Expiration Banner */}
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-[var(--warning)] bg-[var(--warning-bg)] py-2 px-3 rounded-xl border border-[var(--warning)]/20">
              <Clock className="w-4 h-4 animate-spin" />
              <span>Session valid for: {formatTime(secondsLeft)}</span>
            </div>

            {/* Authoritative Vector SVG QR Code */}
            <div className="p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-base)] text-center space-y-4">
              {qrSvg ? (
                <div
                  className="w-52 h-52 mx-auto rounded-2xl bg-white p-3 border border-[var(--border-subtle)] shadow-sm flex items-center justify-center overflow-hidden [&_svg]:w-full [&_svg]:h-full"
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                  aria-label="Authoritative UPI payment QR code"
                />
              ) : (
                <div className="w-52 h-52 mx-auto rounded-2xl bg-[var(--bg-muted)] flex flex-col items-center justify-center gap-2 border border-[var(--border-subtle)]">
                  <RefreshCw className="w-6 h-6 animate-spin text-[var(--text-tertiary)]" />
                  <span className="text-xs text-[var(--text-tertiary)]">Loading payment token...</span>
                </div>
              )}

              <div className="space-y-1.5 pt-1">
                <div className="text-xs font-medium text-[var(--text-secondary)]">
                  Scan with any UPI App (GPay, PhonePe, Paytm, BHIM)
                </div>
                <div className="flex items-center justify-center gap-1.5 text-xs text-[var(--text-tertiary)]">
                  <span>VPA:</span>
                  <span className="font-mono font-bold text-[var(--text-primary)]">campuseats@upi</span>
                  <button
                    type="button"
                    onClick={copyUpiId}
                    className="p-1 hover:text-[var(--text-primary)] transition-colors"
                    title="Copy UPI VPA"
                  >
                    {copiedUpi ? (
                      <Check className="w-3.5 h-3.5 text-[var(--success)]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                {initiationData?.paymentAttemptReference && (
                  <div className="text-[10px] font-mono text-[var(--text-tertiary)] truncate">
                    Ref: {initiationData.paymentAttemptReference}
                  </div>
                )}
              </div>
            </div>

            {/* Mobile UPI Intent Button (Opens real UPI app on mobile) */}
            {initiationData?.intentPayload && (
              <a
                href={initiationData.intentPayload}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button
                  className="w-full"
                  size="lg"
                  variant="primary"
                  leftIcon={<Smartphone className="w-4 h-4" />}
                  rightIcon={<ExternalLink className="w-4 h-4" />}
                >
                  Pay with UPI App
                </Button>
              </a>
            )}

            {/* Authoritative Backend Status Verification Action */}
            <Button
              className="w-full"
              size="md"
              variant="outline"
              loading={isCheckingStatus}
              leftIcon={<RefreshCw className={`w-4 h-4 ${isCheckingStatus ? "animate-spin" : ""}`} />}
              onClick={() => checkStatus()}
            >
              Check Bank Confirmation
            </Button>

            <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-tertiary)] pt-1">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Awaiting authoritative banking settlement...</span>
            </div>
          </div>
        )}

        {/* State 2: SUCCESS */}
        {status === "SUCCESS" && (
          <div className="p-6 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-[var(--success)] mx-auto" />
            <div className="text-lg font-bold text-[var(--text-primary)]">
              Payment Confirmed!
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Your advance payment has settled. Kitchen stations have received your sub-orders.
            </p>
          </div>
        )}

        {/* State 3: FAILED or EXPIRED */}
        {(status === "FAILED" || status === "EXPIRED" || errorMsg) && (
          <div className="p-6 text-center space-y-4 rounded-2xl bg-[var(--danger-bg)] border border-[var(--danger)]/20">
            <AlertTriangle className="w-10 h-10 text-[var(--danger)] mx-auto" />
            <div>
              <div className="text-sm font-bold text-[var(--text-primary)]">
                {status === "EXPIRED"
                  ? "Payment Session Expired"
                  : "Payment Attempt Incomplete"}
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                {errorMsg ||
                  (status === "EXPIRED"
                    ? "The 15-minute validity window expired before bank settlement was received."
                    : "The banking transaction was not completed. Please start a new payment attempt.")}
              </p>
            </div>
            <Button
              className="w-full"
              variant="primary"
              size="sm"
              loading={isInitiating}
              onClick={initiatePayment}
              leftIcon={<RefreshCw className="w-4 h-4" />}
            >
              Initiate New Payment Attempt
            </Button>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-2 pb-4 text-center justify-center text-[11px] text-[var(--text-tertiary)] border-t border-[var(--border-subtle)]">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-[var(--success)]" />
          Authoritative banking settlement &bull; Polling backend state
        </span>
      </CardFooter>
    </Card>
  );
}
