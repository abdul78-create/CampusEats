"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShieldAlert,
  Clock,
  Store,
  CreditCard,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { apiPost } from "@/lib/api/client";
import { toastSuccess, toastError } from "@/lib/api/errors";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/Card";
import { useCart } from "@/features/cart/useCart";
import { useAuth } from "@/features/auth/useAuth";
import type { MasterOrder } from "@/types/api";

export function CheckoutFlow() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const {
    items,
    stallGroups,
    subtotal,
    advancePercentage,
    advanceAmount,
    remainingBalance,
    requestedPickupTime,
    setRequestedPickupTime,
    clearCart,
  } = useCart();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [nextSuggestedTime, setNextSuggestedTime] = useState<string | null>(null);

  // Verification check: Student must be ACTIVE to checkout
  const studentStatus = user?.studentProfile?.accountStatus;
  const isVerified = studentStatus === "ACTIVE";

  const handleCheckout = async (overridePickupTime?: string) => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }

    if (!isVerified) {
      setCheckoutError("Ordering requires an ACTIVE verified student account. Please complete verification.");
      return;
    }

    setIsSubmitting(true);
    setCheckoutError(null);
    setNextSuggestedTime(null);

    const timeToSend = overridePickupTime || requestedPickupTime || undefined;

    try {
      const payload = {
        advancePercentage,
        items: items.map((i) => ({
          menuItemId: i.menuItem.id,
          quantity: i.quantity,
        })),
        requestedPickupTime: timeToSend,
      };

      const masterOrder = await apiPost<MasterOrder>("/orders/checkout", payload);
      clearCart();
      toastSuccess("Order created", "Proceeding to advance payment deposit");
      router.push(`/checkout/payment/${masterOrder.id}`);
    } catch (err: unknown) {
      // Check for 409 PICKUP_TIME_UNAVAILABLE with nextAvailableTime
      const apiErr = err as {
        response?: {
          status?: number;
          data?: {
            error?: {
              code?: string;
              message?: string;
              nextAvailableTime?: string;
            };
          };
        };
      };

      const errorData = apiErr.response?.data?.error;
      if (apiErr.response?.status === 409 || errorData?.code === "PICKUP_TIME_UNAVAILABLE") {
        setCheckoutError(
          errorData?.message ||
            "Requested pickup time is unavailable due to kitchen queue saturation."
        );
        if (errorData?.nextAvailableTime) {
          setNextSuggestedTime(errorData.nextAvailableTime);
        }
      } else {
        setCheckoutError(
          errorData?.message || "Checkout failed. Please review your order and try again."
        );
      }
      toastError(err, "Checkout could not be completed");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <Card className="max-w-lg mx-auto p-8 text-center space-y-4">
        <CardContent className="pt-6 space-y-3">
          <Store className="w-12 h-12 text-[var(--text-tertiary)] mx-auto" />
          <div className="text-lg font-bold text-[var(--text-primary)]">
            No items in your tray
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Your tray is currently empty. Please select items from campus food stalls to checkout.
          </p>
          <Link href="/stalls">
            <Button size="sm" variant="primary">
              Browse Campus Stalls
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Auth / Eligibility Alert if not verified */}
      {!isAuthenticated ? (
        <div className="p-4 rounded-2xl bg-[var(--warning-bg)] border border-[var(--warning)]/30 flex items-center justify-between text-xs text-[var(--warning)]">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span>Please sign in to proceed with checkout.</span>
          </div>
          <Link href="/login">
            <Button size="sm" variant="outline">
              Sign In
            </Button>
          </Link>
        </div>
      ) : !isVerified ? (
        <div className="p-4 rounded-2xl bg-[var(--danger-bg)] border border-[var(--danger)]/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-[var(--danger)]">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <div>
              <div className="font-bold">Student Verification Required</div>
              <div className="opacity-90">
                Current status: {studentStatus || "PENDING_VERIFICATION"}. You must complete ID and liveness verification before ordering.
              </div>
            </div>
          </div>
          <Link href="/student/onboarding">
            <Button size="sm" variant="primary" className="whitespace-nowrap">
              Complete Verification
            </Button>
          </Link>
        </div>
      ) : null}

      {/* Checkout Error Banner */}
      {checkoutError && (
        <div
          className="p-4 rounded-2xl bg-[var(--danger-bg)] border border-[var(--danger)]/30 text-xs text-[var(--danger)] space-y-2"
          role="alert"
        >
          <div className="flex items-center gap-2 font-bold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{checkoutError}</span>
          </div>

          {/* Next Available Time Quick Recovery Action */}
          {nextSuggestedTime && (
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-[var(--danger)]/20">
              <span className="text-[11px]">
                Recommended feasible slot:{" "}
                <strong>{new Date(nextSuggestedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
              </span>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setRequestedPickupTime(nextSuggestedTime);
                  handleCheckout(nextSuggestedTime);
                }}
              >
                Accept Next Feasible Slot
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Stall Sub-orders Grouping Display */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Review Sub-Orders by Stall</CardTitle>
          <CardDescription>
            Multi-stall orders are processed in parallel by independent campus kitchen stations.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {stallGroups.map((group) => (
            <div
              key={group.stallId}
              className="p-4 rounded-2xl bg-[var(--bg-base)] border border-[var(--border-subtle)] space-y-3"
            >
              <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-[var(--accent)]" />
                  <span className="text-sm font-bold text-[var(--text-primary)]">
                    {group.stallName}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Max Prep ~{group.maxPrepTime} mins</span>
                </div>
              </div>

              <div className="space-y-2">
                {group.items.map((item) => (
                  <div
                    key={item.menuItem.id}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-[var(--text-primary)]">
                      {item.quantity} &times; {item.menuItem.name}
                    </span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      ₹{(item.menuItem.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-[var(--border-subtle)] flex justify-between text-xs font-bold text-[var(--text-primary)]">
                <span>Stall Subtotal:</span>
                <span>₹{group.subtotal.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Financial Split Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Payment Split &amp; Counter Balance</CardTitle>
          <CardDescription>
            Advance percentage reserves capacity. Remaining balance is due at counter collection.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]">
            <span className="text-[var(--text-secondary)]">Master Order Total:</span>
            <span className="font-extrabold text-[var(--text-primary)]">₹{subtotal.toFixed(2)}</span>
          </div>

          <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]">
            <span className="text-[var(--text-secondary)]">
              Advance Percentage:
            </span>
            <span className="font-bold text-[var(--accent-text)]">{advancePercentage}%</span>
          </div>

          <div className="flex justify-between py-1 border-b border-[var(--border-subtle)]">
            <span className="text-[var(--text-secondary)]">
              Advance Deposit Payable Now:
            </span>
            <span className="font-extrabold text-lg text-[var(--accent-text)]">
              ₹{advanceAmount.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between py-1">
            <span className="text-[var(--text-secondary)]">
              Remaining Balance (At Counter):
            </span>
            <span className="font-bold text-[var(--text-primary)]">₹{remainingBalance.toFixed(2)}</span>
          </div>
        </CardContent>

        <CardFooter className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-[var(--text-tertiary)] flex items-center gap-1.5">
            <CreditCard className="w-4 h-4" />
            <span>Secure UPI Payment Gateway Settlement</span>
          </div>

          <Button
            size="lg"
            variant="primary"
            loading={isSubmitting}
            disabled={!isAuthenticated || !isVerified || isSubmitting}
            onClick={() => handleCheckout()}
            rightIcon={<ArrowRight className="w-4 h-4" />}
          >
            Confirm &amp; Pay Advance (₹{advanceAmount.toFixed(2)})
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
