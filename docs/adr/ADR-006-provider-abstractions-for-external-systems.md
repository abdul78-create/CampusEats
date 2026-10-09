# ADR-006: Provider Abstractions for External Infrastructure

## Status
Accepted

## Context
CampusEats integrates with external services including Biometric Liveness Verification, UPI Payment Aggregators (Razorpay, PhonePe, Paytm), and Object Storage (S3, GCS). Coupling core business logic directly to third-party SDKs makes unit testing difficult, requires live credentials during local development, and risks vendor lock-in.

## Decision
We apply the **Ports and Adapters (Hexagonal Architecture)** pattern using TypeScript interfaces:
1. **`LivenessVerificationProvider`**: Interface declaring challenge session initiation and validation. Implemented initially as `MockLivenessVerificationProvider` for development/testing, designed to swap with production biometric providers.
2. **`PaymentProvider`**: Interface declaring payment session initiation, signature verification, and refund processing. Implemented initially as `MockPaymentProvider`.
3. **`StorageProvider`**: Interface declaring secure upload, retrieval, and checksum hashing. Implemented initially as `LocalStorageProvider`.
4. **`RealtimeGatewayProvider`**: Interface for channel-based event distribution.

## Consequences
### Positive
- Full local development and offline unit testing without external API keys or cloud dependencies.
- Ability to swap payment or biometric vendors without altering domain logic.
- Mock providers clearly document their development-only status, avoiding misleading security claims.

### Negative
- Requires maintaining both interface declarations and multiple adapter implementations.
