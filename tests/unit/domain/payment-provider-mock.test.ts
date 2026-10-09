import crypto from 'node:crypto';
import { MockPaymentProvider } from '../../../src/modules/payment/domain/PaymentProvider.js';

describe('MockPaymentProvider Cryptographic & Gateway Engine', () => {
  const secret = 'test_webhook_signing_secret_32_characters_long!';
  let provider: MockPaymentProvider;

  beforeEach(() => {
    provider = new MockPaymentProvider(secret);
  });

  describe('UPI Payment Initiation', () => {
    test('generates valid UPI intent URL with UPI parameters and 15-minute TTL', async () => {
      const result = await provider.initiatePayment({
        orderId: 'order_123',
        attemptId: 'att_456',
        amountPaise: 15050, // ₹150.50
        currency: 'INR',
        purpose: 'ADVANCE',
        idempotencyKey: 'idemp_key_1',
      });

      expect(result.providerReference).toBeDefined();
      expect(result.paymentAttemptReference).toBe('att_456');
      expect(result.intentPayload).toContain('upi://pay?');
      expect(result.intentPayload).toContain('pa=campuseats@upi');
      expect(result.intentPayload).toContain('am=150.50');
      expect(result.intentPayload).toContain('cu=INR');
      expect(result.intentPayload).toContain('tr=att_456');
      expect(result.qrPayload).toBe(result.intentPayload);

      // Verify 15-minute validity window
      const expectedMinExpiry = Date.now() + 14 * 60 * 1000;
      const expectedMaxExpiry = Date.now() + 16 * 60 * 1000;
      expect(result.expiresAt.getTime()).toBeGreaterThan(expectedMinExpiry);
      expect(result.expiresAt.getTime()).toBeLessThan(expectedMaxExpiry);
    });
  });

  describe('HMAC-SHA256 Webhook Verification & Replay Protection', () => {
    test('successfully verifies genuine signed webhook buffer within tolerance window', () => {
      const payloadObj = {
        eventId: 'evt_1',
        eventType: 'payment.success',
        providerTransactionId: 'att_456',
        orderId: 'order_123',
        amountPaise: 15050,
        currency: 'INR',
        purpose: 'ADVANCE',
      };
      const rawBody = Buffer.from(JSON.stringify(payloadObj), 'utf8');
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const signature = provider.generateTestWebhookSignature(rawBody, timestamp);

      const isValid = provider.verifyWebhookSignature(rawBody, signature, timestamp);
      expect(isValid).toBe(true);
    });

    test('strictly rejects tampered webhook body (payload tampering attack)', () => {
      const originalPayload = Buffer.from(JSON.stringify({ amountPaise: 10000 }), 'utf8');
      const tamperedPayload = Buffer.from(JSON.stringify({ amountPaise: 100 }), 'utf8');
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const signature = provider.generateTestWebhookSignature(originalPayload, timestamp);

      const isValid = provider.verifyWebhookSignature(tamperedPayload, signature, timestamp);
      expect(isValid).toBe(false);
    });

    test('strictly rejects expired webhook timestamps (> 300s / 5-minute replay window)', () => {
      const rawBody = Buffer.from(JSON.stringify({ test: 'replay' }), 'utf8');
      // 301 seconds in the past
      const expiredTimestamp = (Math.floor(Date.now() / 1000) - 305).toString();

      const signature = provider.generateTestWebhookSignature(rawBody, expiredTimestamp);

      const isValid = provider.verifyWebhookSignature(rawBody, signature, expiredTimestamp);
      expect(isValid).toBe(false);
    });

    test('strictly rejects future timestamps skewed beyond 5 minutes', () => {
      const rawBody = Buffer.from(JSON.stringify({ test: 'future_replay' }), 'utf8');
      const futureTimestamp = (Math.floor(Date.now() / 1000) + 400).toString();

      const signature = provider.generateTestWebhookSignature(rawBody, futureTimestamp);

      const isValid = provider.verifyWebhookSignature(rawBody, signature, futureTimestamp);
      expect(isValid).toBe(false);
    });

    test('strictly rejects invalid or malformed signatures', () => {
      const rawBody = Buffer.from(JSON.stringify({ test: 'data' }), 'utf8');
      const timestamp = Math.floor(Date.now() / 1000).toString();

      expect(provider.verifyWebhookSignature(rawBody, 'invalid_sig', timestamp)).toBe(false);
      expect(provider.verifyWebhookSignature(rawBody, '', timestamp)).toBe(false);
      expect(provider.verifyWebhookSignature(rawBody, crypto.randomBytes(32).toString('hex'), timestamp)).toBe(false);
    });
  });

  describe('Webhook Payload Parsing & Refunds', () => {
    test('parses raw body into typed WebhookPayload', () => {
      const rawBody = Buffer.from(
        JSON.stringify({
          eventId: 'evt_99',
          eventType: 'payment.success',
          providerTransactionId: 'txn_123',
          orderId: 'order_abc',
          amountPaise: 25000,
          currency: 'INR',
          purpose: 'ADVANCE',
        }),
        'utf8'
      );

      const parsed = provider.parseWebhookPayload(rawBody);
      expect(parsed.eventId).toBe('evt_99');
      expect(parsed.providerTransactionId).toBe('txn_123');
      expect(parsed.amountPaise).toBe(25000);
      expect(parsed.purpose).toBe('ADVANCE');
      expect(parsed.currency).toBe('INR');
    });

    test('processes simulated refund with success or failure control', async () => {
      const successResult = await provider.processRefund({
        refundId: 'ref_1',
        subOrderId: 'sub_1',
        originalProviderTransactionId: 'txn_orig',
        refundAmountPaise: 5000,
        reason: 'Kitchen out of stock',
        idempotencyKey: 'idemp_ref_1',
      });

      expect(successResult.status).toBe('SUCCESS');
      expect(successResult.providerRefundReference).toContain('MOCK_REF_');

      provider.setSimulateRefundFailure(true);
      const failResult = await provider.processRefund({
        refundId: 'ref_2',
        subOrderId: 'sub_1',
        originalProviderTransactionId: 'txn_orig',
        refundAmountPaise: 5000,
        reason: 'Simulated failure',
        idempotencyKey: 'idemp_ref_2',
      });

      expect(failResult.status).toBe('FAILED');
    });
  });
});
