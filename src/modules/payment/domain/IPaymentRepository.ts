import { 
  Payment, 
  PaymentTransaction, 
  Refund, 
  PaymentStatus, 
  TransactionType, 
  RefundStatus 
} from '@prisma/client';

export interface CreatePaymentDTO {
  masterOrderId: string;
  idempotencyKey: string;
  provider?: string;
  providerPaymentId?: string;
  advancePercentage: number;
  totalAmount: number;
  advanceAmount: number;
  amountRemaining: number;
  upiVpa?: string;
}

export interface UpdatePaymentDTO {
  status?: PaymentStatus;
  amountPaid?: number;
  amountRemaining?: number;
  verifiedAt?: Date | null;
}

export interface CreateTransactionAttemptDTO {
  paymentId: string;
  transactionType: TransactionType;
  amount: number;
  providerTransactionId: string;
  paymentMethod?: string;
  status?: PaymentStatus;
  expiresAt: Date;
  gatewayResponse?: Record<string, unknown>;
}

export interface UpdateTransactionAttemptDTO {
  status?: PaymentStatus;
  expiresAt?: Date | null;
  gatewayResponse?: Record<string, unknown>;
}

export interface CreateRefundDTO {
  subOrderId: string;
  idempotencyKey: string;
  amountPaidForSuborder: number;
  refundAmount: number;
  refundReason: string;
  refundStatus?: RefundStatus;
  refundReference?: string;
  providerRefundId?: string;
}

export interface UpdateRefundDTO {
  refundStatus?: RefundStatus;
  providerRefundId?: string;
  refundReference?: string;
  completedAt?: Date | null;
}

export interface IPaymentRepository {
  findPaymentById(id: string): Promise<Payment | null>;
  findPaymentByOrderId(masterOrderId: string): Promise<(Payment & { transactions: PaymentTransaction[] }) | null>;
  createPayment(data: CreatePaymentDTO): Promise<Payment>;
  updatePayment(id: string, data: UpdatePaymentDTO): Promise<Payment>;
  
  createTransactionAttempt(data: CreateTransactionAttemptDTO): Promise<PaymentTransaction>;
  findAttemptById(id: string): Promise<PaymentTransaction | null>;
  findAttemptByProviderTransactionId(providerTransactionId: string): Promise<(PaymentTransaction & { payment: Payment }) | null>;
  findActiveAttempt(paymentId: string): Promise<PaymentTransaction | null>;
  updateTransactionAttempt(id: string, data: UpdateTransactionAttemptDTO): Promise<PaymentTransaction>;

  createRefund(data: CreateRefundDTO): Promise<Refund>;
  findRefundBySubOrderId(subOrderId: string): Promise<Refund | null>;
  findRefundByIdempotencyKey(key: string): Promise<Refund | null>;
  updateRefund(id: string, data: UpdateRefundDTO): Promise<Refund>;
}
