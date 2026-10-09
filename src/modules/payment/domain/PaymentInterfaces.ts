import { PaymentStatus, TransactionType, RefundStatus, PaymentPurpose } from './PaymentEnums.js';

export interface PaymentTransactionProps {
  id: string;
  paymentId: string;
  transactionType: TransactionType;
  amount: number;
  providerTransactionId?: string | null;
  paymentMethod: string;
  status: PaymentStatus;
  expiresAt?: Date | null;
  gatewayResponse?: Record<string, unknown> | null;
  createdAt: Date;
}

export interface PaymentProps {
  id: string;
  masterOrderId: string;
  idempotencyKey: string;
  provider: string;
  providerPaymentId?: string | null;
  status: PaymentStatus;
  advancePercentage: number;
  totalAmount: number;
  advanceAmount: number;
  amountPaid: number;
  amountRemaining: number;
  upiVpa?: string | null;
  verifiedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  transactions?: PaymentTransactionProps[];
}

export interface RefundProps {
  id: string;
  subOrderId: string;
  idempotencyKey: string;
  amountPaidForSuborder: number;
  refundAmount: number;
  refundReason: string;
  refundReference?: string | null;
  refundStatus: RefundStatus;
  providerRefundId?: string | null;
  initiatedAt: Date;
  completedAt?: Date | null;
}

export interface PaymentInitiationParams {
  orderId: string;
  attemptId: string;
  amountPaise: number;
  currency: string;
  purpose: PaymentPurpose;
  idempotencyKey: string;
}

export interface PaymentInitiationResult {
  providerReference: string;
  paymentAttemptReference: string;
  intentPayload: string;
  qrPayload: string;
  expiresAt: Date;
}

export interface RefundExecutionParams {
  refundId: string;
  subOrderId: string;
  originalProviderTransactionId: string;
  refundAmountPaise: number;
  reason: string;
  idempotencyKey: string;
}

export interface RefundExecutionResult {
  providerRefundReference: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  processedAt: Date;
}

export interface WebhookPayload {
  eventId: string;
  eventType: string; // e.g. 'payment.success' | 'payment.failed'
  providerTransactionId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  purpose: PaymentPurpose;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentVerificationRequest {
  paymentId: string;
  gatewayTransactionId: string;
  signature: string;
  rawWebhookPayload?: unknown;
}

export interface PaymentVerificationResult {
  isSuccessful: boolean;
  gatewayTransactionId: string;
  amountSettled: number;
  bankReference: string;
  verifiedAt: Date;
}

export interface ProcessRefundRequest {
  subOrderId: string;
  amountPaidForSuborder: number;
  refundAmount: number;
  reason: string;
  idempotencyKey: string;
}

export interface RefundResult {
  isInitiated: boolean;
  providerRefundId: string;
  refundStatus: RefundStatus;
  initiatedAt: Date;
}
