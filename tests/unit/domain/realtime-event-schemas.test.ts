import { describe, it, expect } from '@jest/globals';
import { DomainEventType } from '../../../src/modules/realtime/domain/RealtimeEnums.js';
import { EVENT_PAYLOAD_SCHEMAS, DomainEventEnvelope } from '../../../src/modules/realtime/domain/RealtimeInterfaces.js';

describe('Real-Time Domain Event Payload Schemas & Envelopes', () => {
  it('validates ORDER_PAYMENT_CONFIRMED payload schema', () => {
    const schema = EVENT_PAYLOAD_SCHEMAS[DomainEventType.ORDER_PAYMENT_CONFIRMED];
    const valid = {
      masterOrderId: '11111111-1111-1111-1111-111111111111',
      orderNumber: 'ORD-2026-001',
      amountPaid: 150.0,
      amountRemaining: 150.0,
      advancePercentage: 50,
      subOrderIds: ['22222222-2222-2222-2222-222222222222'],
    };

    expect(() => schema.parse(valid)).not.toThrow();

    const invalid = {
      masterOrderId: 'not-a-uuid',
      orderNumber: '',
      amountPaid: -10,
    };
    expect(() => schema.parse(invalid)).toThrow();
  });

  it('validates KITCHEN_ORDER_INCOMING payload schema', () => {
    const schema = EVENT_PAYLOAD_SCHEMAS[DomainEventType.KITCHEN_ORDER_INCOMING];
    const valid = {
      subOrderId: '22222222-2222-2222-2222-222222222222',
      subOrderNumber: 'ORD-2026-001-A',
      orderNumber: 'ORD-2026-001',
      stallId: '33333333-3333-3333-3333-333333333333',
      items: [
        { name: 'Paneer Roll', quantity: 2 },
        { name: 'Cold Coffee', quantity: 1 },
      ],
      scheduledPickupTime: new Date().toISOString(),
      studentFirstName: 'Alex',
    };

    expect(() => schema.parse(valid)).not.toThrow();

    const invalid = {
      subOrderId: '22222222-2222-2222-2222-222222222222',
      items: [], // empty items array should fail min(1)
    };
    expect(() => schema.parse(invalid)).toThrow();
  });

  it('validates SUBORDER_READY payload schema with pickupGraceExpiresAt', () => {
    const schema = EVENT_PAYLOAD_SCHEMAS[DomainEventType.SUBORDER_READY];
    const readyAt = new Date().toISOString();
    const graceExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const valid = {
      subOrderId: '22222222-2222-2222-2222-222222222222',
      subOrderNumber: 'ORD-2026-001-A',
      stallId: '33333333-3333-3333-3333-333333333333',
      readyAt,
      pickupGraceExpiresAt: graceExpiry,
    };

    expect(() => schema.parse(valid)).not.toThrow();
  });

  it('validates PICKUP_GRACE_WARNING payload schema', () => {
    const schema = EVENT_PAYLOAD_SCHEMAS[DomainEventType.PICKUP_GRACE_WARNING];
    const valid = {
      subOrderId: '22222222-2222-2222-2222-222222222222',
      subOrderNumber: 'ORD-2026-001-A',
      stallId: '33333333-3333-3333-3333-333333333333',
      minutesRemaining: 5,
      pickupGraceExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };

    expect(() => schema.parse(valid)).not.toThrow();
  });

  it('validates KITCHEN_SURGE_ALERT payload schema', () => {
    const schema = EVENT_PAYLOAD_SCHEMAS[DomainEventType.KITCHEN_SURGE_ALERT];
    const valid = {
      stallId: '33333333-3333-3333-3333-333333333333',
      activePreparingCount: 16,
      maxActiveOrders: 20,
      capacityUtilizationPercentage: 80,
      message: 'Kitchen at 80% capacity',
    };

    expect(() => schema.parse(valid)).not.toThrow();
  });

  it('validates REFUND_PROCESSED payload schema', () => {
    const schema = EVENT_PAYLOAD_SCHEMAS[DomainEventType.REFUND_PROCESSED];
    const valid = {
      refundId: '44444444-4444-4444-4444-444444444444',
      subOrderId: '22222222-2222-2222-2222-222222222222',
      subOrderNumber: 'ORD-2026-001-A',
      refundAmount: 75.5,
      providerRefundId: 'MOCK_REF_12345',
      reason: 'Stall rejected sub-order',
    };

    expect(() => schema.parse(valid)).not.toThrow();
  });

  it('validates complete domain event envelope structure', () => {
    const envelope: DomainEventEnvelope = {
      id: '55555555-5555-5555-5555-555555555555',
      channel: 'user:student_123',
      sequenceNumber: 1,
      eventType: DomainEventType.SUBORDER_CONFIRMED,
      aggregateType: 'SubOrder',
      aggregateId: '22222222-2222-2222-2222-222222222222',
      correlationId: 'req_abc123',
      payload: {
        subOrderId: '22222222-2222-2222-2222-222222222222',
        subOrderNumber: 'ORD-2026-001-A',
        stallId: '33333333-3333-3333-3333-333333333333',
        scheduledPickupTime: new Date().toISOString(),
        estimatedPrepMinutes: 12,
      },
      publishedAt: new Date().toISOString(),
    };

    expect(envelope.id).toBeDefined();
    expect(envelope.channel).toMatch(/^user:/);
    expect(envelope.sequenceNumber).toBeGreaterThan(0);
    expect(typeof envelope.publishedAt).toBe('string');
  });
});
