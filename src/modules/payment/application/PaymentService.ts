import { PrismaClient, Prisma, PaymentStatus, TransactionType, RefundStatus, MasterOrderStatus, SubOrderStatus, NotificationType } from '@prisma/client';
import crypto from 'node:crypto';
import { IPaymentProvider } from '../domain/PaymentProvider.js';
import { IPaymentRepository } from '../domain/IPaymentRepository.js';
import { IAuditLogRepository } from '../../audit/domain/IAuditLogRepository.js';
import { AuditActionType } from '../../audit/domain/AuditEnums.js';
import { IIdempotencyRepository } from '../../../shared/infrastructure/IIdempotencyRepository.js';
import { 
  PaymentInitiationResult 
} from '../domain/PaymentInterfaces.js';
import { OrderStateValidator } from '../../ordering/domain/OrderStateValidator.js';
import { PaymentRules } from '../domain/PaymentRules.js';
import { EventOutboxService } from '../../realtime/application/EventOutboxService.js';
import { DomainEventType } from '../../realtime/domain/RealtimeEnums.js';
import { DomainEventEnvelope } from '../../realtime/domain/RealtimeInterfaces.js';
import { 
  NotFoundError, 
  ForbiddenError, 
  ConflictError, 
  ValidationError, 
  UnauthorizedError 
} from '../../../shared/errors/DomainErrors.js';

export interface InitiateAdvancePaymentInput {
  orderId: string;
  idempotencyKey: string;
  upiVpa?: string;
}

export interface InitiateBalancePaymentInput {
  subOrderId: string;
  idempotencyKey: string;
}

export class PaymentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly _paymentRepo: IPaymentRepository,
    private readonly paymentProvider: IPaymentProvider,
    private readonly auditRepo: IAuditLogRepository,
    private readonly idempotencyRepo: IIdempotencyRepository,
    private readonly outboxService?: EventOutboxService
  ) {}

  public get paymentRepository(): IPaymentRepository {
    return this._paymentRepo;
  }

  /**
   * Initiates advance UPI payment for a MasterOrder.
   * Enforces student ownership, order state preconditions, 15-minute TTL, and idempotency.
   */
  async initiateAdvancePayment(
    userId: string,
    input: InitiateAdvancePaymentInput
  ): Promise<PaymentInitiationResult> {
    const { orderId, idempotencyKey, upiVpa } = input;

    // 1. Idempotency Check: return cached result if already processed
    const existingRecord = await this.idempotencyRepo.find(idempotencyKey);
    if (existingRecord?.isCompleted && existingRecord.responsePayload) {
      return existingRecord.responsePayload as unknown as PaymentInitiationResult;
    }
    if (existingRecord && !existingRecord.isCompleted && existingRecord.expiresAt > new Date()) {
      throw new ConflictError('Concurrent payment initiation in progress');
    }

    // Record in-flight claim
    await this.idempotencyRepo.save({
      key: idempotencyKey,
      targetAction: 'INITIATE_ADVANCE_PAYMENT',
      requestHash: crypto.createHash('sha256').update(`${userId}:${orderId}`).digest('hex'),
      isCompleted: false,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min claim
      createdAt: new Date(),
    });

    try {
      // 2. Resolve MasterOrder and assert ownership and status
      const masterOrder = await this.prisma.masterOrder.findUnique({
        where: { id: orderId },
        include: { subOrders: true },
      });

      if (!masterOrder) {
        throw new NotFoundError('MasterOrder could not be found');
      }

      // IDOR defense: only the ordering student can initiate payment
      if (masterOrder.studentId !== userId) {
        throw new ForbiddenError('Unauthorized: You cannot pay for another student’s order');
      }

      if (masterOrder.status !== MasterOrderStatus.PENDING_PAYMENT) {
        throw new ConflictError(
          `Cannot initiate payment on order in state ${masterOrder.status}`
        );
      }

      // 3. Resolve or Create Payment aggregate root
      let payment = await this.prisma.payment.findFirst({
        where: { masterOrderId: orderId },
        include: {
          transactions: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!payment) {
        payment = await this.prisma.payment.create({
          data: {
            masterOrderId: orderId,
            idempotencyKey,
            provider: 'mock',
            advancePercentage: masterOrder.advancePercentage,
            totalAmount: masterOrder.totalAmount,
            advanceAmount: masterOrder.advanceAmount,
            amountPaid: new Prisma.Decimal(0.00),
            amountRemaining: masterOrder.remainingAmount,
            upiVpa,
            status: PaymentStatus.INITIATED,
          },
          include: {
            transactions: {
              orderBy: { createdAt: 'desc' },
            },
          },
        });
      }

      // 4. Check for existing active attempt (15-min TTL)
      const now = new Date();
      const activeAttempt = payment.transactions?.find(
        t => t.status === PaymentStatus.INITIATED && t.expiresAt && t.expiresAt > now
      );

      if (activeAttempt) {
        // Active attempt already exists, generate payloads for it
        const amountPaise = Math.round(Number(activeAttempt.amount) * 100);
        const result = await this.paymentProvider.initiatePayment({
          orderId,
          attemptId: activeAttempt.providerTransactionId || activeAttempt.id,
          amountPaise,
          currency: 'INR',
          purpose: 'ADVANCE',
          idempotencyKey,
        });

        const finalResult: PaymentInitiationResult = {
          ...result,
          expiresAt: activeAttempt.expiresAt!,
        };

        await this.idempotencyRepo.complete(idempotencyKey, finalResult as any, 200);
        return finalResult;
      }

      // If previous attempt expired, mark it EXPIRED
      const expiredAttempt = payment.transactions?.find(
        t => t.status === PaymentStatus.INITIATED && t.expiresAt && t.expiresAt <= now
      );
      if (expiredAttempt) {
        await this.prisma.paymentTransaction.update({
          where: { id: expiredAttempt.id },
          data: { status: PaymentStatus.EXPIRED },
        });

        await this.auditRepo.append({
          actorId: userId,
          actionType: AuditActionType.PAYMENT_EXPIRED,
          targetEntity: 'PaymentTransaction',
          targetId: expiredAttempt.id,
          reason: '15-minute payment validity TTL expired',
        });
      }

      // 5. Create new payment attempt (#1 or retry #2)
      const attemptId = `ATT_ADV_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const amountPaise = Math.round(Number(masterOrder.advanceAmount) * 100);

      const providerResult = await this.paymentProvider.initiatePayment({
        orderId,
        attemptId,
        amountPaise,
        currency: 'INR',
        purpose: 'ADVANCE',
        idempotencyKey,
      });

      await this.prisma.paymentTransaction.create({
        data: {
          paymentId: payment.id,
          transactionType: TransactionType.ADVANCE,
          amount: masterOrder.advanceAmount,
          providerTransactionId: attemptId,
          paymentMethod: 'UPI',
          status: PaymentStatus.INITIATED,
          expiresAt: providerResult.expiresAt,
        },
      });

      // 6. Append sanitized audit log (No VPA, no secrets)
      await this.auditRepo.append({
        actorId: userId,
        actionType: AuditActionType.PAYMENT_INITIATED,
        targetEntity: 'Payment',
        targetId: payment.id,
        newValue: {
          orderId,
          attemptId,
          amountPaise,
          purpose: 'ADVANCE',
          expiresAt: providerResult.expiresAt,
        },
        reason: 'UPI Advance payment initiated by student',
      });

      // 7. Complete idempotency record
      await this.idempotencyRepo.complete(idempotencyKey, providerResult as any, 200);

      return providerResult;
    } catch (error) {
      if (this.idempotencyRepo.delete) {
        await this.idempotencyRepo.delete(idempotencyKey);
      }
      throw error;
    }
  }

  /**
   * Webhook processing pipeline with HMAC-SHA256 verification, replay protection,
   * amount check, and database-level serialization against racing callbacks.
   */
  async handleWebhook(
    rawBody: Buffer,
    signatureHeader: string,
    timestampHeader: string
  ): Promise<{ success: boolean; message: string; transactionId?: string }> {
    // 1. Validate signature & timestamp replay window
    const isValid = this.paymentProvider.verifyWebhookSignature(
      rawBody,
      signatureHeader,
      timestampHeader
    );

    if (!isValid) {
      throw new UnauthorizedError('Invalid or expired payment webhook signature');
    }

    // 2. Parse payload
    const payload = this.paymentProvider.parseWebhookPayload(rawBody);

    // Currency check
    if (payload.currency !== 'INR') {
      throw new ValidationError('Invalid currency in webhook payload: must be INR');
    }

    // 3. Database-level serialization: execute inside a transaction with row lock
    // Resolve target attempt
    const attempt = await this.prisma.paymentTransaction.findUnique({
      where: { providerTransactionId: payload.providerTransactionId },
      include: {
        payment: {
          include: {
            masterOrder: {
              include: { subOrders: { include: { items: true, pickupSchedule: true } } },
            },
          },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundError(
        `Payment transaction attempt "${payload.providerTransactionId}" not found`
      );
    }

    // Webhook Idempotency: If already SUCCESS, return 200 without double crediting
    if (attempt.status === PaymentStatus.SUCCESS) {
      return {
        success: true,
        message: 'Webhook already processed (idempotent)',
        transactionId: attempt.id,
      };
    }

    // 4. Authoritative Amount Check: Compare against persisted attempt amount
    const expectedAmountPaise = Math.round(Number(attempt.amount) * 100);
    if (payload.amountPaise !== expectedAmountPaise) {
      // Mark attempt as FAILED immediately
      await this.prisma.paymentTransaction.update({
        where: { id: attempt.id },
        data: {
          status: PaymentStatus.FAILED,
          gatewayResponse: {
            error: 'PAYMENT_AMOUNT_MISMATCH',
            receivedAmountPaise: payload.amountPaise,
            expectedAmountPaise,
          } as Prisma.InputJsonValue,
        },
      });

      await this.auditRepo.append({
        actorId: attempt.payment.masterOrder.studentId,
        actionType: AuditActionType.PAYMENT_FAILED,
        targetEntity: 'PaymentTransaction',
        targetId: attempt.id,
        reason: `PAYMENT_AMOUNT_MISMATCH: Received ₹${payload.amountPaise / 100} expected ₹${expectedAmountPaise / 100}`,
      });

      throw new ValidationError(
        `PAYMENT_AMOUNT_MISMATCH: Webhook amount ₹${payload.amountPaise / 100} does not match expected ₹${expectedAmountPaise / 100}`
      );
    }

    // Purpose check
    if (payload.purpose !== attempt.transactionType) {
      throw new ValidationError(
        `Payment purpose mismatch: webhook declared ${payload.purpose} for attempt ${attempt.transactionType}`
      );
    }

    // 3. Database-level serialization: execute inside a transaction with row lock
    const envelopesToPublish: DomainEventEnvelope[] = [];
    const txResult = await this.prisma.$transaction(async tx => {
      // Lock row to serialize competing webhook deliveries
      await tx.$queryRaw`SELECT id FROM "PaymentTransaction" WHERE "providerTransactionId" = ${payload.providerTransactionId} FOR UPDATE`;

      const freshAttempt = await tx.paymentTransaction.findUnique({
        where: { providerTransactionId: payload.providerTransactionId },
      });

      if (freshAttempt?.status === PaymentStatus.SUCCESS) {
        return {
          success: true,
          message: 'Webhook already processed (idempotent)',
          transactionId: attempt.id,
        };
      }

      // 5. Atomic State Transition
      if (attempt.transactionType === TransactionType.ADVANCE) {
        // Advance Payment Confirmation
        await tx.paymentTransaction.update({
          where: { id: attempt.id },
          data: {
            status: PaymentStatus.SUCCESS,
            gatewayResponse: payload as unknown as Prisma.InputJsonValue,
          },
        });

        const newAmountPaid = new Prisma.Decimal(
          Number(attempt.payment.amountPaid) + Number(attempt.amount)
        );
        const hasRemainingBalance = Number(attempt.payment.amountRemaining) > 0;

        await tx.payment.update({
          where: { id: attempt.paymentId },
          data: {
            status: hasRemainingBalance ? PaymentStatus.PARTIALLY_PAID : PaymentStatus.SUCCESS,
            amountPaid: newAmountPaid,
            verifiedAt: new Date(),
          },
        });

        await tx.masterOrder.update({
          where: { id: attempt.payment.masterOrderId },
          data: {
            status: MasterOrderStatus.PAYMENT_CONFIRMED,
            amountPaid: newAmountPaid,
          },
        });

        // Dispatch all child SubOrders to stall kitchens and credit advance amounts
        const subOrderSplits = PaymentRules.allocateSubOrderSplits(
          attempt.payment.masterOrder.subOrders.map(so => ({
            subOrderId: so.id,
            subtotal: Number(so.subtotalAmount),
          })),
          attempt.payment.advancePercentage
        );
        const splitMap = new Map(subOrderSplits.map(s => [s.subOrderId, s]));

        for (const subOrder of attempt.payment.masterOrder.subOrders) {
          const split = splitMap.get(subOrder.id);
          const advancePaid = split ? split.advanceAmount : Number(subOrder.advancePaidAmount);
          const balanceDue = split ? split.balanceDue : Number(subOrder.balanceDueAmount);

          await tx.subOrder.update({
            where: { id: subOrder.id },
            data: {
              status: SubOrderStatus.PAYMENT_CONFIRMED,
              advancePaidAmount: new Prisma.Decimal(advancePaid),
              balanceDueAmount: new Prisma.Decimal(balanceDue),
            },
          });
        }

        // Cryptographic Audit Log
        await this.auditRepo.append({
          actorId: attempt.payment.masterOrder.studentId,
          actionType: AuditActionType.PAYMENT_COMPLETED,
          targetEntity: 'Payment',
          targetId: attempt.paymentId,
          newValue: {
            amountPaid: Number(newAmountPaid),
            advanceAmount: Number(attempt.amount),
            providerTransactionId: payload.providerTransactionId,
          },
          reason: 'Advance payment settled via cryptographic webhook',
        });

        // Persistent notification for student
        await tx.notification.create({
          data: {
            userId: attempt.payment.masterOrder.studentId,
            type: NotificationType.PAYMENT_CONFIRMATION,
            title: 'Payment Confirmed',
            message: `Advance payment of ₹${Number(attempt.amount).toFixed(2)} confirmed! Your order has been dispatched to the food stalls.`,
            payload: {
              orderId: attempt.payment.masterOrderId,
              advanceAmount: Number(attempt.amount),
            },
          },
        });

        // Real-Time Outbox Events (Phase 6)
        if (this.outboxService) {
          const payEnv = await this.outboxService.appendTransactionalEvent(tx, {
            channel: `user:${attempt.payment.masterOrder.studentId}`,
            eventType: DomainEventType.ORDER_PAYMENT_CONFIRMED,
            aggregateType: 'MasterOrder',
            aggregateId: attempt.payment.masterOrderId,
            correlationId: payload.providerTransactionId,
            payload: {
              masterOrderId: attempt.payment.masterOrderId,
              orderNumber: attempt.payment.masterOrder.orderNumber,
              amountPaid: Number(newAmountPaid),
              amountRemaining: Number(attempt.payment.amountRemaining),
              advancePercentage: attempt.payment.advancePercentage,
              subOrderIds: attempt.payment.masterOrder.subOrders.map(s => s.id),
            },
          });
          envelopesToPublish.push(payEnv);

          for (const subOrder of attempt.payment.masterOrder.subOrders) {
            const subOrderItems = (subOrder as any).items?.map((it: any) => ({
              name: it.snapshotItemName,
              quantity: it.quantity,
            })) || [{ name: 'Order Item', quantity: 1 }];

            const kitchenEnv = await this.outboxService.appendTransactionalEvent(tx, {
              channel: `stall:${subOrder.stallId}`,
              eventType: DomainEventType.KITCHEN_ORDER_INCOMING,
              aggregateType: 'SubOrder',
              aggregateId: subOrder.id,
              correlationId: payload.providerTransactionId,
              payload: {
                subOrderId: subOrder.id,
                subOrderNumber: subOrder.subOrderNumber,
                orderNumber: attempt.payment.masterOrder.orderNumber,
                stallId: subOrder.stallId,
                items: subOrderItems,
                scheduledPickupTime: subOrder.pickupSchedule?.scheduledPickupTime
                  ? subOrder.pickupSchedule.scheduledPickupTime.toISOString()
                  : new Date().toISOString(),
                studentFirstName: 'Student',
              },
            });
            envelopesToPublish.push(kitchenEnv);

            const subEnv = await this.outboxService.appendTransactionalEvent(tx, {
              channel: `user:${attempt.payment.masterOrder.studentId}`,
              eventType: DomainEventType.SUBORDER_CONFIRMED,
              aggregateType: 'SubOrder',
              aggregateId: subOrder.id,
              correlationId: payload.providerTransactionId,
              payload: {
                subOrderId: subOrder.id,
                subOrderNumber: subOrder.subOrderNumber,
                stallId: subOrder.stallId,
                scheduledPickupTime: subOrder.pickupSchedule?.scheduledPickupTime
                  ? subOrder.pickupSchedule.scheduledPickupTime.toISOString()
                  : new Date().toISOString(),
                estimatedPrepMinutes: subOrder.pickupSchedule?.preparationTimeMinutes || 10,
              },
            });
            envelopesToPublish.push(subEnv);
          }
        }

        return {
          success: true,
          message: 'Advance payment confirmed and order dispatched to kitchen queues',
          transactionId: attempt.id,
        };
      } else {
        // Remaining Balance Online Payment
        await tx.paymentTransaction.update({
          where: { id: attempt.id },
          data: {
            status: PaymentStatus.SUCCESS,
            gatewayResponse: payload as unknown as Prisma.InputJsonValue,
          },
        });

        const newAmountPaid = new Prisma.Decimal(
          Number(attempt.payment.amountPaid) + Number(attempt.amount)
        );

        // Find the target sub-order from metadata or resolve matching balance
        const targetSubOrderId = (payload.metadata?.subOrderId as string) || undefined;
        let targetSubOrder = targetSubOrderId
          ? attempt.payment.masterOrder.subOrders.find(s => s.id === targetSubOrderId)
          : attempt.payment.masterOrder.subOrders.find(
              s => !s.isBalancePaid && Math.round(Number(s.balanceDueAmount) * 100) === payload.amountPaise
            );

        if (!targetSubOrder && attempt.payment.masterOrder.subOrders.length === 1) {
          targetSubOrder = attempt.payment.masterOrder.subOrders[0];
        }

        if (targetSubOrder) {
          await tx.subOrder.update({
            where: { id: targetSubOrder.id },
            data: {
              isBalancePaid: true,
              balanceDueAmount: new Prisma.Decimal(0.00),
            },
          });
        }

        // Check if all suborders have balance paid
        const allSubOrders = await tx.subOrder.findMany({
          where: { masterOrderId: attempt.payment.masterOrderId },
        });
        const allPaid = allSubOrders.every(s => s.isBalancePaid || Number(s.balanceDueAmount) <= 0);

        await tx.payment.update({
          where: { id: attempt.paymentId },
          data: {
            status: allPaid ? PaymentStatus.SUCCESS : PaymentStatus.PARTIALLY_PAID,
            amountPaid: newAmountPaid,
          },
        });

        await this.auditRepo.append({
          actorId: attempt.payment.masterOrder.studentId,
          actionType: AuditActionType.BALANCE_SETTLED_ONLINE,
          targetEntity: 'SubOrder',
          targetId: targetSubOrder ? targetSubOrder.id : attempt.paymentId,
          newValue: {
            subOrderId: targetSubOrder?.id,
            settledAmount: Number(attempt.amount),
            providerTransactionId: payload.providerTransactionId,
          },
          reason: 'Sub-order balance settled online via UPI webhook',
        });

        await tx.notification.create({
          data: {
            userId: attempt.payment.masterOrder.studentId,
            type: NotificationType.PAYMENT_CONFIRMATION,
            title: 'Balance Settled',
            message: `Remaining balance of ₹${Number(attempt.amount).toFixed(2)} settled online! You may now collect your order.`,
            payload: {
              subOrderId: targetSubOrder?.id,
              amount: Number(attempt.amount),
            },
          },
        });

        if (this.outboxService && targetSubOrder) {
          const balEnv = await this.outboxService.appendTransactionalEvent(tx, {
            channel: `user:${attempt.payment.masterOrder.studentId}`,
            eventType: DomainEventType.BALANCE_PAYMENT_CONFIRMED,
            aggregateType: 'SubOrder',
            aggregateId: targetSubOrder.id,
            correlationId: payload.providerTransactionId,
            payload: {
              subOrderId: targetSubOrder.id,
              subOrderNumber: targetSubOrder.subOrderNumber,
              balancePaidAmount: Number(attempt.amount),
              paymentMethod: 'ONLINE_UPI',
            },
          });
          envelopesToPublish.push(balEnv);
        }

        return {
          success: true,
          message: 'Online balance payment confirmed',
          transactionId: attempt.id,
        };
      }
    });

    for (const env of envelopesToPublish) {
      await this.outboxService?.publishEnvelope(env);
    }

    return txResult;
  }

  /**
   * Initiates online balance settlement for a READY sub-order via UPI.
   */
  async initiateBalancePayment(
    userId: string,
    input: InitiateBalancePaymentInput
  ): Promise<PaymentInitiationResult> {
    const { subOrderId, idempotencyKey } = input;

    // Idempotency check
    const existing = await this.idempotencyRepo.find(idempotencyKey);
    if (existing?.isCompleted && existing.responsePayload) {
      return existing.responsePayload as unknown as PaymentInitiationResult;
    }

    await this.idempotencyRepo.save({
      key: idempotencyKey,
      targetAction: 'INITIATE_BALANCE_PAYMENT',
      requestHash: crypto.createHash('sha256').update(`${userId}:${subOrderId}`).digest('hex'),
      isCompleted: false,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      createdAt: new Date(),
    });

    try {
      const subOrder = await this.prisma.subOrder.findUnique({
        where: { id: subOrderId },
        include: { masterOrder: true },
      });

      if (!subOrder) {
        throw new NotFoundError('SubOrder could not be found');
      }

      // IDOR Defense: only the ordering student can settle balance
      if (subOrder.masterOrder.studentId !== userId) {
        throw new ForbiddenError('Unauthorized: You cannot pay balance for another student’s order');
      }

      // Lifecycle Gate: SubOrder must be in READY status before balance collection
      if (subOrder.status !== SubOrderStatus.READY) {
        throw new ValidationError(
          `Balance settlement is only permitted when sub-order has reached READY status (current status: ${subOrder.status})`
        );
      }

      if (subOrder.isBalancePaid || Number(subOrder.balanceDueAmount) <= 0) {
        throw new ValidationError('Balance for this sub-order is already settled');
      }

      // Resolve parent Payment
      let payment = await this.prisma.payment.findFirst({
        where: { masterOrderId: subOrder.masterOrderId },
      });

      if (!payment) {
        throw new NotFoundError('Parent payment record not found');
      }

      const balanceDue = Number(subOrder.balanceDueAmount);
      const amountPaise = Math.round(balanceDue * 100);
      const attemptId = `ATT_BAL_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

      const providerResult = await this.paymentProvider.initiatePayment({
        orderId: subOrder.masterOrderId,
        attemptId,
        amountPaise,
        currency: 'INR',
        purpose: 'REMAINING_BALANCE',
        idempotencyKey,
      });

      await this.prisma.paymentTransaction.create({
        data: {
          paymentId: payment.id,
          transactionType: TransactionType.REMAINING_BALANCE,
          amount: new Prisma.Decimal(balanceDue),
          providerTransactionId: attemptId,
          paymentMethod: 'UPI',
          status: PaymentStatus.INITIATED,
          expiresAt: providerResult.expiresAt,
          gatewayResponse: { subOrderId } as Prisma.InputJsonValue,
        },
      });

      await this.auditRepo.append({
        actorId: userId,
        actionType: AuditActionType.PAYMENT_INITIATED,
        targetEntity: 'SubOrder',
        targetId: subOrderId,
        newValue: {
          subOrderId,
          attemptId,
          amountPaise,
          purpose: 'REMAINING_BALANCE',
        },
        reason: 'Online balance settlement initiated by student',
      });

      await this.idempotencyRepo.complete(idempotencyKey, providerResult as any, 200);

      return providerResult;
    } catch (error) {
      if (this.idempotencyRepo.delete) {
        await this.idempotencyRepo.delete(idempotencyKey);
      }
      throw error;
    }
  }

  /**
   * Fault-Isolated Sub-Order Refund Engine.
   * Derives refund amount authoritatively from ledger (rejects client amounts).
   * Executes refund provider call outside database transaction, ensuring no fake distributed transactions.
   */
  async processIsolatedRefund(
    adminUserId: string,
    subOrderId: string,
    reason: string,
    idempotencyKey: string
  ): Promise<{
    refundId: string;
    subOrderId: string;
    refundAmount: number;
    refundStatus: RefundStatus;
    providerRefundId?: string;
  }> {
    // 1. Idempotency Check: if refund already completed, return cached result
    const existingRefund = await this.prisma.refund.findUnique({
      where: { subOrderId },
    });

    if (existingRefund) {
      if (existingRefund.refundStatus === RefundStatus.REFUNDED) {
        return {
          refundId: existingRefund.id,
          subOrderId: existingRefund.subOrderId,
          refundAmount: Number(existingRefund.refundAmount),
          refundStatus: existingRefund.refundStatus,
          providerRefundId: existingRefund.providerRefundId || undefined,
        };
      }
      if (existingRefund.refundStatus === RefundStatus.REFUND_PENDING || existingRefund.refundStatus === RefundStatus.PROCESSING) {
        return {
          refundId: existingRefund.id,
          subOrderId: existingRefund.subOrderId,
          refundAmount: Number(existingRefund.refundAmount),
          refundStatus: existingRefund.refundStatus,
        };
      }
    }

    // 2. Fetch and assert SubOrder status
    const subOrder = await this.prisma.subOrder.findUnique({
      where: { id: subOrderId },
      include: {
        masterOrder: {
          include: {
            subOrders: true,
            payments: {
              include: {
                transactions: true,
              },
            },
          },
        },
      },
    });

    if (!subOrder) {
      throw new NotFoundError('SubOrder could not be found');
    }

    if (subOrder.status !== SubOrderStatus.REJECTED && subOrder.status !== SubOrderStatus.CANCELLED) {
      throw new ValidationError(
        `SubOrder must be in REJECTED or CANCELLED status to process a refund (current: ${subOrder.status})`
      );
    }

    // 3. Authoritative server calculation: SubOrder advance deposit share
    const refundableAmount = Number(subOrder.advancePaidAmount);
    if (refundableAmount <= 0) {
      throw new ValidationError(
        'No advance deposit exists on this sub-order to refund'
      );
    }

    // Step 1 (DB): Atomically claim or retrieve existing refund record
    const { record: refundRecord, shouldProcess } = await this.prisma.$transaction(async tx => {
      // Serialize on sub-order row
      await tx.$queryRaw`SELECT id FROM "SubOrder" WHERE id = ${subOrderId} FOR UPDATE`;

      const current = await tx.refund.findUnique({ where: { subOrderId } });
      if (current) {
        return { record: current, shouldProcess: false };
      }

      const created = await tx.refund.create({
        data: {
          subOrderId,
          idempotencyKey,
          amountPaidForSuborder: new Prisma.Decimal(refundableAmount),
          refundAmount: new Prisma.Decimal(refundableAmount),
          refundReason: reason,
          refundStatus: RefundStatus.REFUND_PENDING,
        },
      });

      await tx.subOrder.update({
        where: { id: subOrderId },
        data: { status: SubOrderStatus.REFUND_PENDING },
      });

      return { record: created, shouldProcess: true };
    });

    if (!shouldProcess) {
      if (refundRecord.refundStatus === RefundStatus.REFUNDED) {
        return {
          refundId: refundRecord.id,
          subOrderId,
          refundAmount: Number(refundRecord.refundAmount),
          refundStatus: RefundStatus.REFUNDED,
          providerRefundId: refundRecord.providerRefundId || undefined,
        };
      }

      // Concurrency defense: wait for the in-flight processor to finish Step 3
      const maxRetries = 30;
      for (let i = 0; i < maxRetries; i++) {
        await new Promise(r => setTimeout(r, 100));
        const latest = await this.prisma.refund.findUnique({ where: { subOrderId } });
        if (latest && latest.refundStatus === RefundStatus.REFUNDED) {
          return {
            refundId: latest.id,
            subOrderId,
            refundAmount: Number(latest.refundAmount),
            refundStatus: RefundStatus.REFUNDED,
            providerRefundId: latest.providerRefundId || undefined,
          };
        }
      }

      return {
        refundId: refundRecord.id,
        subOrderId,
        refundAmount: Number(refundRecord.refundAmount),
        refundStatus: refundRecord.refundStatus,
        providerRefundId: refundRecord.providerRefundId || undefined,
      };
    }

    // Step 2 (External): Call IPaymentProvider outside SQL transaction
    const originalTxn = subOrder.masterOrder.payments
      .flatMap(p => p.transactions)
      .find(t => t.transactionType === TransactionType.ADVANCE && t.status === PaymentStatus.SUCCESS);

    const providerResult = await this.paymentProvider.processRefund({
      refundId: refundRecord.id,
      subOrderId,
      originalProviderTransactionId: originalTxn?.providerTransactionId || 'MOCK_ORIGINAL_TXN',
      refundAmountPaise: Math.round(refundableAmount * 100),
      reason,
      idempotencyKey,
    });

    // Step 3 (DB): Complete state transitions based on provider outcome
    if (providerResult.status === 'SUCCESS') {
      const refundEnvelopes: DomainEventEnvelope[] = [];
      await this.prisma.$transaction(async tx => {
        await tx.refund.update({
          where: { id: refundRecord.id },
          data: {
            refundStatus: RefundStatus.REFUNDED,
            providerRefundId: providerResult.providerRefundReference,
            completedAt: new Date(),
          },
        });

        await tx.subOrder.update({
          where: { id: subOrderId },
          data: { status: SubOrderStatus.REFUNDED },
        });

        // Dynamic derivation of MasterOrderStatus
        const allSiblings = await tx.subOrder.findMany({
          where: { masterOrderId: subOrder.masterOrderId },
        });
        const derivedStatus = OrderStateValidator.deriveMasterOrderStatus(
          allSiblings.map(s => s.status) as any
        );

        await tx.masterOrder.update({
          where: { id: subOrder.masterOrderId },
          data: { status: derivedStatus },
        });

        await this.auditRepo.append({
          actorId: adminUserId,
          actionType: AuditActionType.REFUND_COMPLETED,
          targetEntity: 'Refund',
          targetId: refundRecord.id,
          newValue: {
            subOrderId,
            refundAmount: refundableAmount,
            providerRefundReference: providerResult.providerRefundReference,
            masterOrderStatus: derivedStatus,
          },
          reason: `Isolated refund processed: ${reason}`,
        });

        await tx.notification.create({
          data: {
            userId: subOrder.masterOrder.studentId,
            type: NotificationType.REFUND_PROCESSED,
            title: 'Refund Processed',
            message: `A refund of ₹${refundableAmount.toFixed(2)} has been credited back for your order. Reason: ${reason}`,
            payload: {
              subOrderId,
              refundAmount: refundableAmount,
              reference: providerResult.providerRefundReference,
            },
          },
        });

        // Real-Time Outbox Event (Phase 6)
        if (this.outboxService) {
          const refEnv = await this.outboxService.appendTransactionalEvent(tx, {
            channel: `user:${subOrder.masterOrder.studentId}`,
            eventType: DomainEventType.REFUND_PROCESSED,
            aggregateType: 'Refund',
            aggregateId: refundRecord.id,
            correlationId: idempotencyKey,
            payload: {
              refundId: refundRecord.id,
              subOrderId,
              refundAmount: refundableAmount,
              providerRefundReference: providerResult.providerRefundReference,
              reason,
            },
          });
          refundEnvelopes.push(refEnv);
        }
      });

      for (const env of refundEnvelopes) {
        await this.outboxService?.publishEnvelope(env);
      }

      return {
        refundId: refundRecord.id,
        subOrderId,
        refundAmount: refundableAmount,
        refundStatus: RefundStatus.REFUNDED,
        providerRefundId: providerResult.providerRefundReference,
      };
    } else {
      await this.prisma.refund.update({
        where: { id: refundRecord.id },
        data: { refundStatus: RefundStatus.FAILED },
      });

      await this.auditRepo.append({
        actorId: adminUserId,
        actionType: AuditActionType.REFUND_FAILED,
        targetEntity: 'Refund',
        targetId: refundRecord.id,
        reason: 'Payment provider rejected refund execution',
      });

      return {
        refundId: refundRecord.id,
        subOrderId,
        refundAmount: refundableAmount,
        refundStatus: RefundStatus.FAILED,
      };
    }
  }

  /**
   * Retrieves payment status and attempt history for an order.
   */
  async getPaymentStatus(orderId: string, userId: string, userRole: string): Promise<any> {
    const masterOrder = await this.prisma.masterOrder.findUnique({
      where: { id: orderId },
      include: {
        payments: {
          include: {
            transactions: {
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        subOrders: {
          include: {
            refund: true,
          },
        },
      },
    });

    if (!masterOrder) {
      throw new NotFoundError('Order not found');
    }

    // IDOR protection: students can only view their own payment status
    if (userRole === 'STUDENT' && masterOrder.studentId !== userId) {
      throw new ForbiddenError('Unauthorized: You cannot view another student’s payment');
    }

    const payment = masterOrder.payments[0] || null;

    return {
      orderId: masterOrder.id,
      orderNumber: masterOrder.orderNumber,
      orderStatus: masterOrder.status,
      totalAmount: Number(masterOrder.totalAmount),
      advancePercentage: masterOrder.advancePercentage,
      advanceAmount: Number(masterOrder.advanceAmount),
      remainingAmount: Number(masterOrder.remainingAmount),
      amountPaid: Number(masterOrder.amountPaid),
      payment: payment ? {
        id: payment.id,
        status: payment.status,
        amountPaid: Number(payment.amountPaid),
        amountRemaining: Number(payment.amountRemaining),
        verifiedAt: payment.verifiedAt,
        transactions: payment.transactions.map(t => ({
          id: t.id,
          transactionType: t.transactionType,
          amount: Number(t.amount),
          status: t.status,
          providerTransactionId: t.providerTransactionId,
          expiresAt: t.expiresAt,
          createdAt: t.createdAt,
        })),
      } : null,
      subOrders: masterOrder.subOrders.map(so => ({
        id: so.id,
        subOrderNumber: so.subOrderNumber,
        status: so.status,
        subtotalAmount: Number(so.subtotalAmount),
        advancePaidAmount: Number(so.advancePaidAmount),
        balanceDueAmount: Number(so.balanceDueAmount),
        isBalancePaid: so.isBalancePaid,
        refund: so.refund ? {
          id: so.refund.id,
          refundAmount: Number(so.refund.refundAmount),
          status: so.refund.refundStatus,
          reference: so.refund.providerRefundId,
        } : null,
      })),
    };
  }
}
