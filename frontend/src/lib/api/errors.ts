/**
 * CampusEats - Centralised error handling
 *
 * Maps HTTP status codes and backend error codes to user-facing messages.
 * Raw Prisma errors, stack traces, and backend internals must never reach the UI.
 */
import { toast } from "sonner";
import { normaliseApiError } from "./client";

export interface UiError {
  /** Short code for programmatic handling in components */
  code: string;
  /** Human-readable message safe to display */
  message: string;
  /** Present on 409 PICKUP_TIME_UNAVAILABLE */
  nextAvailableTime?: string;
  /** Whether the session has definitively expired */
  isSessionExpired: boolean;
}

const STATUS_MESSAGES: Record<number, string> = {
  400: "The request was invalid. Please check your input.",
  401: "Your session has expired. Please sign in again.",
  403: "You don't have permission to do that.",
  404: "The requested resource was not found.",
  409: "A conflict occurred. Please refresh and try again.",
  429: "Too many requests. Please wait a moment and try again.",
  500: "Something went wrong on our end. Please try again shortly.",
  502: "Service unavailable. Please try again later.",
  503: "Service temporarily unavailable.",
};

const CODE_MESSAGES: Record<string, string> = {
  STUDENT_VERIFICATION_REQUIRED: "Please complete your identity verification before ordering.",
  PAYMENT_EXPIRED: "Your payment session expired. Please start a new payment.",
  PAYMENT_FAILED: "Payment failed. Please try again.",
  PICKUP_TIME_UNAVAILABLE: "That pickup time is unavailable.",
  STUDENT_ACCOUNT_SUSPENDED: "Your account has been suspended. Please contact support.",
  LIVENESS_LOCKED: "Liveness verification is locked due to repeated failures.",
  VALIDATION_FAILED: "Please check your input and try again.",
};

export function toUiError(err: unknown): UiError {
  const apiErr = normaliseApiError(err);
  const codeMsg = CODE_MESSAGES[apiErr.code];
  const statusCode = parseInt(apiErr.code.replace("HTTP_", ""), 10);
  const statusMsg = STATUS_MESSAGES[statusCode];

  return {
    code: apiErr.code,
    message: codeMsg ?? statusMsg ?? apiErr.message,
    nextAvailableTime: (err as { response?: { data?: { error?: { nextAvailableTime?: string } } } })
      ?.response?.data?.error?.nextAvailableTime,
    isSessionExpired: apiErr.code === "HTTP_401" || statusCode === 401,
  };
}

/** Show a toast for a mutation error. Safe to call anywhere. */
export function toastError(err: unknown, description?: string): void {
  if (typeof err === "string") {
    toast.error(err, description ? { description } : undefined);
    return;
  }
  const uiErr = toUiError(err);
  toast.error(uiErr.message || "Something went wrong.", description ? { description } : undefined);
}

/** Show a success toast. */
export function toastSuccess(message: string, description?: string): void {
  toast.success(message, description ? { description } : undefined);
}

/** Show an informational toast. */
export function toastInfo(message: string, description?: string): void {
  toast.info(message, description ? { description } : undefined);
}

/** Show a warning toast. */
export function toastWarning(message: string, description?: string): void {
  toast.warning(message, description ? { description } : undefined);
}

