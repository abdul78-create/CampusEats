import crypto from 'node:crypto';
import {
  PaymentInitiationParams,
  PaymentInitiationResult,
  RefundExecutionParams,
  RefundExecutionResult,
  WebhookPayload,
  PaymentVerificationRequest,
  PaymentVerificationResult,
  ProcessRefundRequest,
  RefundResult,
} from './PaymentInterfaces.js';
import { RefundStatus } from './PaymentEnums.js';

export interface IPaymentProvider {
  initiatePayment(params: PaymentInitiationParams): Promise<PaymentInitiationResult>;
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string, timestampHeader: string): boolean;
  parseWebhookPayload(rawBody: Buffer): WebhookPayload;
  processRefund(params: RefundExecutionParams): Promise<RefundExecutionResult>;
}

export interface PaymentProvider extends IPaymentProvider {
  // Backwards compatibility with earlier drafts if needed
  verifyPayment?(request: PaymentVerificationRequest): Promise<PaymentVerificationResult>;
}

/**
 * Mock Payment Provider for Development and Automated Testing.
 * Simulates UPI intent strings, dynamic QR payloads, and HMAC-SHA256 webhooks.
 */
export class MockPaymentProvider implements IPaymentProvider {
  private readonly webhookSigningSecret: string;
  private simulateRefundFailure: boolean = false;

  constructor(secret?: string) {
    this.webhookSigningSecret = 
      secret || 
      process.env.WEBHOOK_SIGNING_SECRET || 
      'campuseats_mock_webhook_secret_key_32_chars!';
  }

  public setSimulateRefundFailure(fail: boolean): void {
    this.simulateRefundFailure = fail;
  }

  /**
   * Generates realistic simulated UPI intent URI and dynamic QR code string with 15-minute TTL.
   */
  async initiatePayment(params: PaymentInitiationParams): Promise<PaymentInitiationResult> {
    const amountRupees = (params.amountPaise / 100).toFixed(2);
    const providerReference = `MOCK_TXN_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    
    const intentPayload = `upi://pay?pa=campuseats@upi&pn=CampusEats&am=${amountRupees}&cu=INR&tr=${params.attemptId}`;
    const qrPayload = intentPayload;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15-minute validity window

    return {
      providerReference,
      paymentAttemptReference: params.attemptId,
      intentPayload,
      qrPayload,
      expiresAt,
    };
  }

  /**
   * Validates HMAC-SHA256 signature using timing-safe comparison and checks 5-minute replay window.
   * Signed payload format: `${timestamp}.${rawBody.toString('utf8')}`.
   */
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string, timestampHeader: string): boolean {
    if (!signatureHeader || !timestampHeader || !rawBody) {
      return false;
    }

    // 1. Replay Protection: Reject timestamps outside 5-minute tolerance window (|now - timestamp| > 300s)
    const timestampSec = parseInt(timestampHeader, 10);
    if (isNaN(timestampSec)) {
      return false;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - timestampSec) > 300) {
      return false;
    }

    // 2. Compute expected HMAC-SHA256 signature over `${timestamp}.${rawBody}`
    const message = `${timestampHeader}.${rawBody.toString('utf8')}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSigningSecret)
      .update(message)
      .digest('hex');

    // 3. Constant-time comparison to prevent timing attacks
    const sigBuffer = Buffer.from(signatureHeader.trim().toLowerCase(), 'hex');
    const expectedBuffer = Buffer.from(expectedSignature.toLowerCase(), 'hex');

    if (sigBuffer.length !== expectedBuffer.length || sigBuffer.length === 0) {
      return false;
    }

    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  }

  /**
   * Parses verified raw webhook buffer into typed WebhookPayload.
   */
  parseWebhookPayload(rawBody: Buffer): WebhookPayload {
    const json = JSON.parse(rawBody.toString('utf8'));
    return {
      eventId: json.eventId || `evt_${Date.now()}`,
      eventType: json.eventType || 'payment.success',
      providerTransactionId: json.providerTransactionId,
      orderId: json.orderId,
      amountPaise: json.amountPaise,
      currency: json.currency || 'INR',
      purpose: json.purpose || 'ADVANCE',
      timestamp: json.timestamp || new Date().toISOString(),
      metadata: json.metadata,
    };
  }

  /**
   * Simulates external gateway refund processing (executed outside database transaction).
   */
  async processRefund(_params: RefundExecutionParams): Promise<RefundExecutionResult> {
    if (this.simulateRefundFailure) {
      return {
        providerRefundReference: `MOCK_REF_FAILED_${Date.now()}`,
        status: 'FAILED',
        processedAt: new Date(),
      };
    }

    const providerRefundReference = `MOCK_REF_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    return {
      providerRefundReference,
      status: 'SUCCESS',
      processedAt: new Date(),
    };
  }

  /**
   * Helper utility for tests to generate valid webhook signatures.
   */
  generateTestWebhookSignature(rawBody: Buffer, timestampHeader: string): string {
    const message = `${timestampHeader}.${rawBody.toString('utf8')}`;
    return crypto
      .createHmac('sha256', this.webhookSigningSecret)
      .update(message)
      .digest('hex');
  }

  // Legacy compatibility implementations
  async verifyPayment(request: PaymentVerificationRequest): Promise<PaymentVerificationResult> {
    return {
      isSuccessful: true,
      gatewayTransactionId: request.gatewayTransactionId,
      amountSettled: 100.00,
      bankReference: `BANK_REF_${Date.now()}`,
      verifiedAt: new Date(),
    };
  }

  async processRefundLegacy(_request: ProcessRefundRequest): Promise<RefundResult> {
    return {
      isInitiated: true,
      providerRefundId: `mock_ref_${Date.now()}`,
      refundStatus: RefundStatus.REFUNDED,
      initiatedAt: new Date(),
    };
  }
}
