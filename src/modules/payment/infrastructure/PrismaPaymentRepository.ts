import { 
  PrismaClient, 
  Payment, 
  PaymentTransaction, 
  Refund, 
  PaymentStatus, 
  Prisma 
} from '@prisma/client';
import { 
  IPaymentRepository, 
  CreatePaymentDTO, 
  UpdatePaymentDTO,
  CreateTransactionAttemptDTO, 
  UpdateTransactionAttemptDTO,
  CreateRefundDTO,
  UpdateRefundDTO
} from '../domain/IPaymentRepository.js';

export class PrismaPaymentRepository implements IPaymentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findPaymentById(id: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({
      where: { id },
    });
  }

  async findPaymentByOrderId(masterOrderId: string): Promise<(Payment & { transactions: PaymentTransaction[] }) | null> {
    return this.prisma.payment.findFirst({
      where: { masterOrderId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async createPayment(data: CreatePaymentDTO): Promise<Payment> {
    return this.prisma.payment.create({
      data: {
        masterOrderId: data.masterOrderId,
        idempotencyKey: data.idempotencyKey,
        provider: data.provider || 'mock',
        providerPaymentId: data.providerPaymentId,
        advancePercentage: data.advancePercentage,
        totalAmount: new Prisma.Decimal(data.totalAmount),
        advanceAmount: new Prisma.Decimal(data.advanceAmount),
        amountPaid: new Prisma.Decimal(0.00),
        amountRemaining: new Prisma.Decimal(data.amountRemaining),
        upiVpa: data.upiVpa,
        status: PaymentStatus.INITIATED,
      },
    });
  }

  async updatePayment(id: string, data: UpdatePaymentDTO): Promise<Payment> {
    return this.prisma.payment.update({
      where: { id },
      data: {
        status: data.status,
        amountPaid: data.amountPaid !== undefined ? new Prisma.Decimal(data.amountPaid) : undefined,
        amountRemaining: data.amountRemaining !== undefined ? new Prisma.Decimal(data.amountRemaining) : undefined,
        verifiedAt: data.verifiedAt,
      },
    });
  }

  async createTransactionAttempt(data: CreateTransactionAttemptDTO): Promise<PaymentTransaction> {
    return this.prisma.paymentTransaction.create({
      data: {
        paymentId: data.paymentId,
        transactionType: data.transactionType,
        amount: new Prisma.Decimal(data.amount),
        providerTransactionId: data.providerTransactionId,
        paymentMethod: data.paymentMethod || 'UPI',
        status: data.status || PaymentStatus.INITIATED,
        expiresAt: data.expiresAt,
        gatewayResponse: data.gatewayResponse ? (data.gatewayResponse as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  async findAttemptById(id: string): Promise<PaymentTransaction | null> {
    return this.prisma.paymentTransaction.findUnique({
      where: { id },
    });
  }

  async findAttemptByProviderTransactionId(
    providerTransactionId: string
  ): Promise<(PaymentTransaction & { payment: Payment }) | null> {
    return this.prisma.paymentTransaction.findUnique({
      where: { providerTransactionId },
      include: { payment: true },
    });
  }

  async findActiveAttempt(paymentId: string): Promise<PaymentTransaction | null> {
    const now = new Date();
    return this.prisma.paymentTransaction.findFirst({
      where: {
        paymentId,
        status: PaymentStatus.INITIATED,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateTransactionAttempt(id: string, data: UpdateTransactionAttemptDTO): Promise<PaymentTransaction> {
    return this.prisma.paymentTransaction.update({
      where: { id },
      data: {
        status: data.status,
        expiresAt: data.expiresAt,
        gatewayResponse: data.gatewayResponse ? (data.gatewayResponse as Prisma.InputJsonValue) : undefined,
      },
    });
  }

  async createRefund(data: CreateRefundDTO): Promise<Refund> {
    return this.prisma.refund.create({
      data: {
        subOrderId: data.subOrderId,
        idempotencyKey: data.idempotencyKey,
        amountPaidForSuborder: new Prisma.Decimal(data.amountPaidForSuborder),
        refundAmount: new Prisma.Decimal(data.refundAmount),
        refundReason: data.refundReason,
        refundStatus: data.refundStatus,
        refundReference: data.refundReference,
        providerRefundId: data.providerRefundId,
      },
    });
  }

  async findRefundBySubOrderId(subOrderId: string): Promise<Refund | null> {
    return this.prisma.refund.findUnique({
      where: { subOrderId },
    });
  }

  async findRefundByIdempotencyKey(key: string): Promise<Refund | null> {
    return this.prisma.refund.findUnique({
      where: { idempotencyKey: key },
    });
  }

  async updateRefund(id: string, data: UpdateRefundDTO): Promise<Refund> {
    return this.prisma.refund.update({
      where: { id },
      data: {
        refundStatus: data.refundStatus,
        providerRefundId: data.providerRefundId,
        refundReference: data.refundReference,
        completedAt: data.completedAt,
      },
    });
  }
}
