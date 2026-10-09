import { z } from 'zod';
import { DomainEventType } from './RealtimeEnums.js';

export interface DomainEventEnvelope<T = unknown> {
  eventId: string;           // UUIDv4, globally unique, immutable
  id?: string;               // Alias for eventId
  channel: string;           // e.g. 'user:usr_123' or 'stall:stl_456'
  sequenceNumber: string | number; // Monotonically increasing per channel
  eventType: DomainEventType;
  aggregateType: string;     // 'MasterOrder' | 'SubOrder' | 'Payment' | 'Refund' | 'Stall'
  aggregateId: string;       // Primary entity ID
  serverTimestamp: string;   // ISO-8601 UTC
  publishedAt?: string;      // Alias for serverTimestamp
  payloadVersion: number;    // Semantic integer (v1 = 1)
  correlationId: string;     // Distributed tracing / request ID
  payload: T;                // Sanitized payload validated by Zod
}

// ==========================================
// ZOD SCHEMAS FOR EVENT PAYLOADS
// ==========================================

export const orderPaymentConfirmedPayloadSchema = z.object({
  masterOrderId: z.string().uuid(),
  orderNumber: z.string(),
  amountPaid: z.number().positive(),
  amountRemaining: z.number().nonnegative(),
  advancePercentage: z.number().int().min(50).max(100),
  subOrderIds: z.array(z.string().uuid()),
});

export const balancePaymentConfirmedPayloadSchema = z.object({
  subOrderId: z.string().uuid(),
  subOrderNumber: z.string(),
  balancePaidAmount: z.number().positive(),
  paymentMethod: z.enum(['ONLINE_UPI', 'COUNTER_CASH']),
});

export const paymentFailedPayloadSchema = z.object({
  masterOrderId: z.string().uuid(),
  orderNumber: z.string(),
  attemptId: z.string(),
  reason: z.string(),
});

export const paymentExpiredPayloadSchema = z.object({
  masterOrderId: z.string().uuid(),
  orderNumber: z.string(),
  attemptId: z.string(),
  reason: z.string().default('Payment attempt TTL expired (15 minutes)'),
});

export const refundProcessedPayloadSchema = z.object({
  refundId: z.string().uuid(),
  subOrderId: z.string().uuid(),
  refundAmount: z.number().positive(),
  providerRefundReference: z.string().optional(),
  reason: z.string(),
});

export const subOrderConfirmedPayloadSchema = z.object({
  subOrderId: z.string().uuid(),
  subOrderNumber: z.string(),
  stallId: z.string().uuid(),
  scheduledPickupTime: z.string().datetime(),
  estimatedPrepMinutes: z.number().int().positive(),
});

export const subOrderPreparingPayloadSchema = z.object({
  subOrderId: z.string().uuid(),
  subOrderNumber: z.string(),
  stallId: z.string().uuid(),
  startedAt: z.string().datetime(),
});

export const subOrderReadyPayloadSchema = z.object({
  subOrderId: z.string().uuid(),
  subOrderNumber: z.string(),
  stallId: z.string().uuid(),
  readyAt: z.string().datetime(),
  pickupGraceExpiresAt: z.string().datetime(),
});

export const subOrderCollectedPayloadSchema = z.object({
  subOrderId: z.string().uuid(),
  subOrderNumber: z.string(),
  stallId: z.string().uuid(),
  collectedAt: z.string().datetime(),
});

export const subOrderRejectedPayloadSchema = z.object({
  subOrderId: z.string().uuid(),
  subOrderNumber: z.string(),
  stallId: z.string().uuid(),
  reason: z.string(),
});

export const kitchenOrderIncomingPayloadSchema = z.object({
  subOrderId: z.string().uuid(),
  subOrderNumber: z.string(),
  orderNumber: z.string(),
  stallId: z.string().uuid(),
  items: z.array(z.object({
    name: z.string(),
    quantity: z.number().int().positive(),
  })),
  scheduledPickupTime: z.string().datetime(),
  studentFirstName: z.string(),
});

export const kitchenSurgeAlertPayloadSchema = z.object({
  stallId: z.string().uuid(),
  activePreparingCount: z.number().int(),
  maxActiveOrders: z.number().int(),
  capacityUtilizationPercentage: z.number(),
  message: z.string(),
});

export const pickupGraceWarningPayloadSchema = z.object({
  subOrderId: z.string().uuid(),
  subOrderNumber: z.string(),
  stallId: z.string().uuid(),
  minutesRemaining: z.number(),
  pickupGraceExpiresAt: z.string().datetime(),
});

export const pickupGraceExpiredPayloadSchema = z.object({
  subOrderId: z.string().uuid(),
  subOrderNumber: z.string(),
  stallId: z.string().uuid(),
  expiredAt: z.string().datetime(),
});

export const resyncRequiredPayloadSchema = z.object({
  reason: z.enum(['REPLAY_WINDOW_EXPIRED', 'BUFFER_OVERFLOW', 'CHANNEL_OUT_OF_SYNC']),
  action: z.literal('FETCH_REST_SNAPSHOT'),
});

export const sessionTerminatedPayloadSchema = z.object({
  reason: z.enum(['ACCOUNT_SUSPENDED', 'CREDENTIAL_EXPIRED', 'STAFF_PERMISSION_REVOKED']),
  message: z.string(),
});

export type OrderPaymentConfirmedPayload = z.infer<typeof orderPaymentConfirmedPayloadSchema>;
export type BalancePaymentConfirmedPayload = z.infer<typeof balancePaymentConfirmedPayloadSchema>;
export type PaymentFailedPayload = z.infer<typeof paymentFailedPayloadSchema>;
export type PaymentExpiredPayload = z.infer<typeof paymentExpiredPayloadSchema>;
export type RefundProcessedPayload = z.infer<typeof refundProcessedPayloadSchema>;
export type SubOrderConfirmedPayload = z.infer<typeof subOrderConfirmedPayloadSchema>;
export type SubOrderPreparingPayload = z.infer<typeof subOrderPreparingPayloadSchema>;
export type SubOrderReadyPayload = z.infer<typeof subOrderReadyPayloadSchema>;
export type SubOrderCollectedPayload = z.infer<typeof subOrderCollectedPayloadSchema>;
export type SubOrderRejectedPayload = z.infer<typeof subOrderRejectedPayloadSchema>;
export type KitchenOrderIncomingPayload = z.infer<typeof kitchenOrderIncomingPayloadSchema>;
export type KitchenSurgeAlertPayload = z.infer<typeof kitchenSurgeAlertPayloadSchema>;
export type PickupGraceWarningPayload = z.infer<typeof pickupGraceWarningPayloadSchema>;
export type PickupGraceExpiredPayload = z.infer<typeof pickupGraceExpiredPayloadSchema>;
export type ResyncRequiredPayload = z.infer<typeof resyncRequiredPayloadSchema>;
export type SessionTerminatedPayload = z.infer<typeof sessionTerminatedPayloadSchema>;

/**
 * Registry mapping DomainEventType to its authoritative Zod schema.
 */
export const EVENT_PAYLOAD_SCHEMAS: Record<DomainEventType, z.ZodSchema> = {
  [DomainEventType.ORDER_PAYMENT_CONFIRMED]: orderPaymentConfirmedPayloadSchema,
  [DomainEventType.BALANCE_PAYMENT_CONFIRMED]: balancePaymentConfirmedPayloadSchema,
  [DomainEventType.PAYMENT_FAILED]: paymentFailedPayloadSchema,
  [DomainEventType.PAYMENT_EXPIRED]: paymentExpiredPayloadSchema,
  [DomainEventType.REFUND_PROCESSED]: refundProcessedPayloadSchema,
  [DomainEventType.SUBORDER_CONFIRMED]: subOrderConfirmedPayloadSchema,
  [DomainEventType.SUBORDER_PREPARING]: subOrderPreparingPayloadSchema,
  [DomainEventType.SUBORDER_READY]: subOrderReadyPayloadSchema,
  [DomainEventType.SUBORDER_COLLECTED]: subOrderCollectedPayloadSchema,
  [DomainEventType.SUBORDER_REJECTED]: subOrderRejectedPayloadSchema,
  [DomainEventType.KITCHEN_ORDER_INCOMING]: kitchenOrderIncomingPayloadSchema,
  [DomainEventType.KITCHEN_SURGE_ALERT]: kitchenSurgeAlertPayloadSchema,
  [DomainEventType.PICKUP_GRACE_WARNING]: pickupGraceWarningPayloadSchema,
  [DomainEventType.PICKUP_GRACE_EXPIRED]: pickupGraceExpiredPayloadSchema,
  [DomainEventType.RESYNC_REQUIRED]: resyncRequiredPayloadSchema,
  [DomainEventType.SESSION_TERMINATED]: sessionTerminatedPayloadSchema,
};
