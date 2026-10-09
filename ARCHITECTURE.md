# CampusEats — Architecture Specification

## 1. Architectural Philosophy & Strategy

CampusEats is architected as a **Modular Monolith** with strict **Domain-Driven Design (DDD)** and **Clean Architecture** boundaries. This provides:
1. Strong domain isolation between distinct business sub-systems (e.g. Identity, Stall Operations, Scheduling, Ordering, Payments, Audit).
2. Elimination of distributed transaction complexity (e.g. 2PC / Sagas) during peak lunch-hour operations while retaining the ability to extract sub-services in the future.
3. Strict compile-time and runtime barriers preventing business logic leaks into controllers, route handlers, or client layers.

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT LAYER                                      |
|    (React Client - Strictly FROZEN until Phase 14 Backend Verification Complete)   |
+-----------------------------------------------------------------------------------+
                                         │ HTTPS / WSS
                                         ▼
+-----------------------------------------------------------------------------------+
|                          API GATEWAY / REVERSE PROXY                              |
|          Rate Limiting, SSL Termination, Correlation IDs, Security Headers        |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|                        MODULE APPLICATION & DOMAIN LAYER                          |
|                                                                                   |
|  +---------------------+  +--------------------+  +----------------------------+  |
|  |   Identity Module   |  |    Stall Module    |  |       Ordering Module      |  |
|  | - StudentProfile    |  | - Menu & Inventory |  | - MasterOrder / SubOrder   |  |
|  | - LivenessProvider  |  | - Capacity Config  |  | - State Machine Transition |  |
|  | - StorageProvider   |  | - Acceptance Policy|  | - Immutability Enforcer    |  |
|  +---------------------+  +--------------------+  +----------------------------+  |
|            │                         │                           │                |
|            ▼                         ▼                           ▼                |
|  +---------------------+  +--------------------+  +----------------------------+  |
|  |  Scheduling Engine  |  |   Payment Module   |  |   Audit & Realtime Module  |  |
|  | - Prep Workload     |  | - Partial Advance  |  | - SHA-256 Hash Chain       |  |
|  | - Parallel Slots    |  | - UPI Provider     |  | - Realtime Gateway Bus     |  |
|  | - Queue Delay Calc  |  | - Isolated Refunds |  | - Deduplicated Events      |  |
|  +---------------------+  +--------------------+  +----------------------------+  |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|                           INFRASTRUCTURE & PERSISTENCE                            |
|       PostgreSQL (Prisma ORM)  │  Redis Cache / PubSub  │  Encrypted Storage      |
+-----------------------------------------------------------------------------------+
```

---

## 2. Directory Layout & Module Structure

The project follows a standard Clean Architecture directory hierarchy:

```
src/
├── app.ts                         # Express server instance configuration & middlewares
├── server.ts                      # Process bootstrap, port binding, and graceful shutdown
├── shared/                        # Shared Kernel across all modules
│   ├── domain/                    # AggregateRoot, Entity, ValueObject, DomainEvent
│   ├── errors/                    # DomainError, NotFoundError, UnauthorizedError, ConflictError
│   ├── infrastructure/            # PrismaClient singleton, Winston Logger, IdempotencyStore
│   ├── security/                  # PII Masking, SHA-256 Chaining, Token verification
│   └── types/                     # Result<T, E>, Pagination, Common DTOs
└── modules/                       # Independent Bounded Contexts
    ├── identity/                  # User identity, student verification, liveness challenges
    │   ├── domain/                # User, StudentProfile, VerificationStatus, LivenessScore
    │   ├── application/           # StudentVerificationService, LivenessVerificationProvider
    │   ├── infrastructure/        # PrismaUserRepository, LocalStorageProvider
    │   └── presentation/          # IdentityController, ValidationSchemas
    ├── stall/                     # Food stalls, opening hours, capacity, menus, inventory
    │   ├── domain/                # Stall, StallCapacity, MenuItem, InventoryRecord
    │   ├── application/           # StallService, InventoryService, OrderAcceptanceStrategy
    │   ├── infrastructure/        # PrismaStallRepository, PrismaMenuRepository
    │   └── presentation/          # StallController, MenuController
    ├── ordering/                  # MasterOrder, SubOrder, order items, finite state machines
    │   ├── domain/                # MasterOrder, SubOrder, OrderStateValidator, Snapshots
    │   ├── application/           # OrderPlacementService, SubOrderTransitionService
    │   ├── infrastructure/        # PrismaOrderRepository
    │   └── presentation/          # OrderController, OrderValidator
    ├── scheduling/                # Capacity computation, queue delay, pickup slot allocations
    │   ├── domain/                # PickupSlot, KitchenWorkload, SchedulingExplanation
    │   ├── application/           # PickupSchedulingService, QueueRebalancingEngine
    │   └── infrastructure/        # ScheduleRepository
    ├── payment/                   # UPI integration, partial payments (50-100%), refunds
    │   ├── domain/                # Payment, Transaction, Refund, AdvanceRules
    │   ├── application/           # PaymentService, RefundService, PaymentProvider
    │   ├── infrastructure/        # MockPaymentProvider, RazorpayUpiProvider
    │   └── presentation/          # PaymentController, WebhookHandler
    ├── realtime/                  # Realtime distribution, WebSocket/SSE abstractions
    │   ├── domain/                # RealtimeEvent, ChannelSubscription
    │   ├── application/           # RealtimeBroadcaster, EventDeduplicator
    │   └── infrastructure/        # WebSocketRealtimeGateway, RedisPubSub
    └── audit/                     # Cryptographically hash-chained audit logging
        ├── domain/                # AuditEntry, HashChainBlock
        ├── application/           # AuditLogService, Sha256HashChainService
        └── infrastructure/        # PrismaAuditLogRepository
```

---

## 3. Separation of Concerns & Clean Layering

1. **Domain Layer (Innermost)**:
   - Contains pure business entities, value objects, domain errors, and state machine validation logic.
   - Zero dependencies on frameworks (no Express, no Prisma, no HTTP concepts).
2. **Application Layer**:
   - Contains use-case orchestrators (e.g. `PlaceOrderUseCase`, `CalculatePickupSlotUseCase`, `ProcessRefundUseCase`).
   - Declares provider interfaces (`PaymentProvider`, `LivenessVerificationProvider`, `StorageProvider`).
3. **Infrastructure Layer**:
   - Implements provider interfaces and repository persistence via Prisma ORM and external client libraries.
4. **Presentation Layer (Outermost)**:
   - HTTP controllers, route definitions, parameter validation (via Zod), and JSON response formatting.
   - **Rule:** Controllers merely parse HTTP requests, invoke Application Use-Cases, and format HTTP responses. No business logic in controllers!

---

## 4. Provider Abstractions (Port & Adapter Pattern)

To ensure high testability, local offline development, and zero vendor lock-in, all external dependencies use explicit interfaces:

### 4.1 Liveness Verification
```typescript
export interface LivenessVerificationRequest {
  verificationId: string;
  studentId: string;
  videoBuffer?: Buffer;
  frameSequence?: Buffer[];
  requiredChallenges: LivenessChallengeType[];
}

export interface LivenessVerificationResult {
  isVerified: boolean;
  confidenceScore: number;
  challengesCompleted: {
    naturalBlink: boolean;
    headTurnLeft: boolean;
    headTurnRight: boolean;
  };
  providerReference: string;
}

export interface LivenessVerificationProvider {
  initiateChallenge(studentId: string): Promise<{ sessionId: string; challenges: LivenessChallengeType[] }>;
  verifyLiveness(request: LivenessVerificationRequest): Promise<LivenessVerificationResult>;
}
```

### 4.2 Payment Provider
```typescript
export interface InitiatePaymentRequest {
  masterOrderId: string;
  amount: number;
  advancePercentage: number;
  studentVpa?: string;
  idempotencyKey: string;
}

export interface PaymentInitiationResult {
  paymentId: string;
  upiIntentUrl: string;
  upiQrCodeUrl: string;
  paymentSessionId: string;
}

export interface PaymentVerificationResult {
  isSuccessful: boolean;
  gatewayTransactionId: string;
  amountSettled: number;
  bankReference: string;
}

export interface PaymentProvider {
  initiatePayment(request: InitiatePaymentRequest): Promise<PaymentInitiationResult>;
  verifyPayment(paymentId: string, payload: unknown): Promise<PaymentVerificationResult>;
  processRefund(refundRequest: ProcessRefundRequest): Promise<RefundResult>;
}
```

### 4.3 Storage Provider
```typescript
export interface StorageUploadResult {
  storagePath: string;
  url: string;
  sha256Checksum: string;
  sizeBytes: number;
  mimeType: string;
}

export interface StorageProvider {
  uploadFile(buffer: Buffer, filename: string, mimeType: string): Promise<StorageUploadResult>;
  getFile(storagePath: string): Promise<Buffer>;
  deleteFile(storagePath: string): Promise<void>;
}
```

---

## 5. Security & Idempotency Pipeline

1. **Idempotency Gate**: All mutation endpoints (`/orders`, `/payments/initiate`, `/payments/verify`, `/refunds`) require an `Idempotency-Key` header. Duplicate attempts within a 24-hour TTL return the cached canonical result.
2. **PII Masking Filter**: Data leaving the presentation boundary is stripped of raw student IDs and unmasked phone/UPI strings unless requested by authorized platform admins with audited justification.
3. **Tamper-Evident SHA-256 Audit Log**: Every administrative, pricing, or refund state transition is cryptographically chained to the previous record hash.

---

## 6. Phase 3: Core Ordering Engine, Stall Operations & Pickup Scheduling

### 6.1 MasterOrder vs SubOrder Separation (`MasterOrder != SubOrder`)
A student cart may contain items sourced from multiple campus stalls (e.g. Samosas from Stall A and a Burger from Stall B). 
The ordering architecture strictly decouples checkout orchestration from kitchen execution:
```
MasterOrder (Student Transaction Boundary)
   ├── Payment Agreement (50%–100% Advance Policy, Remaining Balance)
   ├── SubOrder A (Stall A Kitchen Boundary)
   │     ├── OrderItem Snapshots (Authoritative Item Price & Prep Time)
   │     ├── PickupSchedule (Feasible Pickup Slot for Stall A)
   │     └── Independent State Lifecycle (CONFIRMED -> PREPARING -> READY -> COLLECTED)
   └── SubOrder B (Stall B Kitchen Boundary)
         ├── OrderItem Snapshots
         ├── PickupSchedule (Feasible Pickup Slot for Stall B)
         └── Independent State Lifecycle (or isolated REJECTED)
```
- **Operational Isolation**: If Stall A rejects SubOrder A due to a kitchen surge, SubOrder B continues unhindered. The MasterOrder composite status updates to `PARTIALLY_FULFILLED` and records pending refund state for SubOrder A without invalidating SubOrder B.

### 6.2 Backend-Authoritative Pricing & Advance Rules
- **Zero Client Trust**: All client-supplied prices and prep times are discarded. The backend queries live database items, validates availability, and computes item subtotals, sub-order subtotals, and the master total.
- **Advance Rule Enforcement**: Permitted advance percentages are strictly `[50, 60, 70, 80, 90, 100]`. Exact paise-level amounts are calculated using Half-Up policy with proportional sub-order allocation and zero penny drift.

### 6.3 Concurrency & Transaction Boundaries
All checkout operations execute within an atomic PostgreSQL transaction (`$transaction`):
1. **Idempotency Gate**: Claims the `Idempotency-Key` initially to block parallel duplicate submissions.
2. **Conditional Stock Decrement**: Atomically reserves stock using `availableQuantity = availableQuantity - requestedQty`, failing with `INSUFFICIENT_STOCK` if stock is exhausted.
3. **Stall Capacity Reservation**: Queries active sub-orders within the transaction and compares against `stallCapacity.maxActiveOrders`, preventing kitchen oversubscription under concurrent surges.
4. **Feasibility Validation**: Evaluates operating hours, stall operational state (`OPEN`), parallel kitchen workload, and prep time buffers. Infeasible pickup times return structured `400` with `code: "PICKUP_TIME_UNAVAILABLE"` and `nextAvailableTime`.
5. **Rollback Guarantee**: Any validation failure aborts the entire transaction, immediately rolling back any reserved inventory.

### 6.4 Stall & Menu Governance
- **Stall State Engine**: Governs live status (`OPEN`, `CLOSED`, `TEMPORARILY_PAUSED`) within admin-configured university operating hours.
- **Multi-Tenant BOLA Protection**: Stall owners and assigned staff can view and mutate only their owned stall menu, capacity, and sub-order queue. Cross-stall access attempts are denied with `403 FORBIDDEN`.
- **Cryptographic Audit Chaining**: Stall status toggles, menu changes, capacity adjustments, and order state transitions append to the SHA-256 cryptographic hash chain with sanitized actor and resource metadata.

---

## 7. Phase 4: Student Identity, Verification & Account Lifecycle Backend

### 7.1 Authoritative Verification State Machine
The backend acts as the sole, non-bypassable authority governing student verification lifecycles.
```
  [Unverified / Initial]
            │
            ▼
    PENDING_SUBMISSION ──(Submit ID Doc)──► UNDER_REVIEW
            ▲                                      │
            │                                 (Admin Review)
            │                                ┌─────┴─────┐
            │                                ▼           ▼
            └────────(Re-submit)──────── REJECTED     ACTIVE ◄──┐
                                                         │       │
                                                   (Admin Suspend/Reactivate)
                                                         ▼       │
                                                     SUSPENDED ──┘
```
- **Allowed Transitions**:
  - `PENDING_SUBMISSION` $\rightarrow$ `UNDER_REVIEW`
  - `UNDER_REVIEW` $\rightarrow$ `ACTIVE`
  - `UNDER_REVIEW` $\rightarrow$ `REJECTED`
  - `REJECTED` $\rightarrow$ `PENDING_SUBMISSION` | `UNDER_REVIEW`
  - `ACTIVE` $\rightarrow$ `SUSPENDED`
  - `SUSPENDED` $\rightarrow$ `ACTIVE`
- **Strictly Blocked Transitions**:
  - `ACTIVE` $\rightarrow$ `UNDER_REVIEW` or `PENDING_SUBMISSION`
  - `REJECTED` $\rightarrow$ `ACTIVE` directly without a valid review
  - `PENDING_SUBMISSION` $\rightarrow$ `ACTIVE` without document submission and admin adjudication
  - Arbitrary self-transitions or skipped statuses throw domain `ValidationError` or `ConflictError`.

### 7.2 Separation of Concerns: 4 Pillars of Ordering Eligibility
Authentication, Verification, and Account Lifecycle are decoupled into distinct concepts:
$$\text{Authentication (User.isActive)} + \text{Role (User.role === STUDENT)} + \text{Lifecycle (StudentProfile.accountStatus === ACTIVE)} + \text{Verification (StudentVerification.status === ACTIVE)} \Longrightarrow \text{ORDERING ELIGIBLE}$$
- **JWT Claims Alone Are Untrusted**: Every order checkout verifies the live, authoritative PostgreSQL database state.
- **Deactivated or Suspended Users**: Blocked immediately at the database level even if holding unexpired JWT access tokens.
- **Rejected Students**: Cannot place orders; must re-submit documents for admin adjudication.

### 7.3 Document Storage Abstraction & Token Security
- **`IStorageProvider` Interface**: Completely decouples domain logic from physical storage providers (local filesystem, S3, GCS).
- **Controlled Document Access Flow**:
  $$\text{Presentation / Controller} \longrightarrow \text{StudentVerificationService} \longrightarrow \text{IStorageProvider} \longrightarrow \text{LocalStorageProvider / S3}$$
  Raw document bytes are NEVER accessible through unauthenticated or general-purpose routes. Direct `getFile()` cannot be called without cryptographic authorization; download endpoints require `getSignedFile(storagePath, expires, signature)`.
- **Private Storage Isolation**: Uploaded identity documents are stored outside the public web root with cryptographically generated, unguessable storage object keys (`UUIDv4.ext`). Original filenames are sanitized and stored as metadata only.
- **Strict Multipart Upload**: Submissions require `multipart/form-data`. JSON Base64 uploads are rejected to eliminate payload inflation, memory spikes, and dual validation paths.
- **Zero Raw Bytes in PostgreSQL**: PostgreSQL stores metadata only (`fileStoragePath`, `mimeType`, `fileSizeBytes`, `fileSha256Checksum`). Raw document binaries never touch relational tables.
- **Temporary Signed URLs**: Documents are never exposed publicly. Access is mediated via HMAC-SHA256 signed temporary URLs with strict 5-minute expiration (`exp`) and signature verification (`sig`).
- **Strict BOLA/IDOR Ownership Check**: Document URLs can only be generated for the authenticated student who owns the document or platform administrators. Stall owners and staff are strictly forbidden.

### 7.4 Multi-Layer File Validation & Security Defense
- **Authoritative Magic Bytes Inspection**:
  - PDF: `%PDF` (`0x25, 0x50, 0x44, 0x46`)
  - JPEG: `FF D8 FF` (`0xFF, 0xD8, 0xFF`)
  - PNG: `89 50 4E 47 0D 0A 1A 0A` (`0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A`)
- **Prohibited Signatures**: Executables (MZ headers `0x4D, 0x5A`), Linux ELF (`0x7F, 0x45, 0x4C, 0x46`), ZIP/Office archives (`0x50, 0x4B, 0x03, 0x04`), and script/HTML injection tags (`<script>`, `<?php`, `<html`) are strictly rejected.
- **Payload Limits**: Max file size is capped at 5 MB (5,242,880 bytes).
- **Filename Sanitization**: Directory traversal sequences (`../`, `..\\`), control characters, and non-alphanumeric symbols are stripped.

### 7.5 Concurrency & Race Condition Defense
- **Pessimistic Row Locking**: Verification adjudication uses PostgreSQL row locks (`SELECT id FROM "StudentVerification" WHERE id = $1 FOR UPDATE`) inside atomic transactions.
- **Deterministic Outcomes**: Concurrent adjudication requests (e.g., simultaneous approval from two admins, or simultaneous approve and reject) ensure exactly one valid state transition succeeds while the other is rejected with a `ConflictError` (HTTP 409).
- **Transactional State Updates**: Verification state, profile account status, audit logging, and notification creation execute atomically in a single transaction.

---

## 8. Phase 5: Electronic Payments, Webhooks & Fault-Isolated Refunds

### 8.1 Core Payment Aggregate & Attempt Lifecycle
- **Parent Payment Aggregate**: Manages total order amounts, advance percentage splits (50–100%), amount paid, and amount remaining.
- **PaymentTransaction Attempts**: Each initiation creates a discrete transaction attempt with a unique `providerTransactionId` and 15-minute TTL.
- **Transaction Types**: Strictly limited to `ADVANCE` and `REMAINING_BALANCE`.

### 8.2 Webhook Security & Idempotency
- **Cryptographic Verification**: Webhooks are verified using raw-body HMAC-SHA256 signatures with 5-minute replay window defense (`|t - now| <= 300s`).
- **Authoritative Amount Reconciliation**: Webhook settled amounts are verified down to the penny against stored transaction amounts in PostgreSQL.
- **Webhook Idempotency**: Handled gracefully via database locks and cached outcomes without double crediting.

### 8.3 Fault-Isolated Sub-Order Refunds
- **Dedicated `Refund` Aggregate**: Maintains independent refund lifecycle (`REFUND_PENDING` $\rightarrow$ `PROCESSING` $\rightarrow$ `REFUNDED` / `FAILED`).
- **Fault Isolation**: Rejection or cancellation of one sub-order triggers an isolated refund without mutating or cancelling sibling sub-orders.

---

## 9. Phase 6: Real-Time Event Dispatch & Kitchen Queue Engine

### 9.1 SSE Transport & Ephemeral Browser Authentication Tickets
- **Primary Transport**: Server-Sent Events (`text/event-stream`) over `GET /api/v1/events/stream`.
- **Ephemeral Authentication Ticket**: Web browsers initiate SSE connections using short-lived (30-second TTL), single-use tickets acquired via `POST /api/v1/events/ticket`.
- **Ticket Security**: Tickets are hashed with SHA-256 before storage in memory; raw ticket tokens are never stored plaintext.
- **Anti-Replay Defense**: Tickets are consumed atomically on first use; subsequent requests using the same ticket are rejected with 401 Unauthorized.
- **Keepalive Heartbeat**: Periodic `:keepalive` comment frames (every 15s) prevent intermediate proxy and gateway timeouts.

### 9.2 Durable Transactional Outbox & At-Least-Once Delivery
- **Persistence Contract**: Outbox events are stored in the PostgreSQL `EventOutbox` table atomically within the same database transaction that updates business state.
- **Monotonic Channel Sequences**: Each delivery channel (`user:<id>`, `stall:<id>`, `admin:campus`) maintains strictly monotonic sequence numbers enforced via `UNIQUE("channel", "sequenceNumber")`.
- **Reliable Dispatch**: Changes notify active connections in memory immediately post-commit, backed by at-least-once outbox persistence and client deduplication (`eventId`).
- **PostgreSQL LISTEN/NOTIFY Wake-Up**: Serves strictly as a low-latency wake-up notification; the PostgreSQL database table is the durable source of truth.

### 9.3 Catchup Replay Engine & BOLA Defense
- **Last-Event-ID Replay**: Clients reconnecting with `Last-Event-ID` receive missed events from the durable outbox in exact monotonic sequence order.
- **BOLA Protection on Replay**: Replay requests validate that the requested `Last-Event-ID` belongs to a channel the client is authorized to access. Foreign channel event IDs are rejected with 403 Forbidden.
- **Two-Dimensional Replay Boundary**: Replay is permitted if and only if all four conditions are met:
  1. Target event exists in PostgreSQL `EventOutbox`.
  2. Event belongs to an authorized channel for the requesting subject (BOLA check).
  3. Event age is within the contractual rolling window: $\text{age} \le 2\text{ hours}$ (`MAX_REPLAY_AGE_MS = 7,200,000`).
  4. Sequence gap does not exceed the safety capacity limit: $\text{gap} \le 1,000\text{ events}$ (`MAX_REPLAY_LIMIT = 1000`).
- **Resync Protocol (`RESYNC_REQUIRED`)**: If either the 2-hour window has expired or the sequence gap exceeds 1,000 events, the server terminates replay and emits an authoritative `RESYNC_REQUIRED` frame (HTTP 409 / `ConflictError`), commanding the client to execute a full REST state synchronization.

### 9.4 Physical Outbox Retention & Cleanup Mechanism
- **Retention Policy**: Published events are retained in `EventOutbox` for a rolling 2-hour window to satisfy the replay SLA.
- **Physical Pruning Engine**: Rows are pruned periodically via `OutboxRepository.pruneExpiredEvents(retentionHours = 2)` and background cycles in `OutboxRelayer.pruneExpired()`:
  $$\text{DELETE FROM "EventOutbox" WHERE "publishedAt" IS NOT NULL AND "createdAt" < NOW() - INTERVAL '2 hours'}$$
- **Active Replay Invariant**: Deletion affects only events older than 2 hours. Active clients reconnecting within the 2-hour window are guaranteed full event replay availability.
- **Crash Recovery Safety Invariant**: Unpublished records (`publishedAt IS NULL`) are strictly excluded from pruning regardless of creation age, ensuring events are never deleted prior to successful dispatcher delivery.

### 9.5 Concurrent Sequence Allocation & Transaction Advisory Locking
- **Advisory Transaction Locking**: To guarantee strictly gapless, monotonic sequence allocation under high concurrency, `OutboxRepository.appendEvent` executes:
  ```sql
  SELECT pg_advisory_xact_lock(hashtext(channel));
  SELECT COALESCE(MAX("sequenceNumber"), 0) + 1 FROM "EventOutbox" WHERE "channel" = channel;
  ```
- **Serialization Isolation**: Writers targeting the same channel serialize cleanly at the database transaction level, eliminating sequence race conditions and `uq_outbox_channel_seq` collisions. Independent channels execute in full parallel without contention.

### 9.6 Dispatcher Crash Recovery & publishedAt Semantics
- **Atomic Persistence**: Events are committed synchronously with business entities inside the same transaction with `publishedAt = NULL`.
- **Immediate Dispatch vs. Durable Relayer**:
  1. Low-latency path: `publishDirectly()` broadcasts to `EventBus` and records `publishedAt = NOW()`.
  2. Crash-recovery path: If the process crashes or network partition occurs prior to immediate dispatch, `OutboxRelayer.pollAndDispatch()` queries `WHERE "publishedAt" IS NULL`, broadcasts missed events to `EventBus`, and marks them published.
- **`publishedAt` Semantics**: Stored timestamp reflects authoritative publication to the server's internal event bus, never client receipt acknowledgment.

### 9.7 Operational Kitchen Queue Engine
- **Non-Mutating State Derivation**: Derives operational states dynamically from authoritative Phase 3 `SubOrderStatus` without creating a secondary persistent database lifecycle:
  - `PAYMENT_CONFIRMED`, `CONFIRMED` $\Longrightarrow$ `QUEUED`
  - `PREPARING` $\Longrightarrow$ `IN_PREPARATION`
  - `READY` (within grace) $\Longrightarrow$ `READY_FOR_PICKUP`
  - `READY` (past grace), `MISSED_PICKUP`, `EXPIRED` $\Longrightarrow$ `EXPIRED_UNCOLLECTED`
  - `COLLECTED` $\Longrightarrow$ `COMPLETED`
  - `REJECTED`, `CANCELLED`, `REFUND_PENDING`, `REFUNDED`, `PAYMENT_FAILED` $\Longrightarrow$ `REJECTED`
- **Deterministic Queue Ordering**:
  1. `scheduledPickupTime ASC`
  2. `createdAt ASC`
  3. `id ASC` (tie-breaking across distributed instances)
- **Explicit Pickup Grace Timestamps**:
  $$\text{graceStart} = \text{readyAt}, \quad \text{graceExpiry} = \text{readyAt} + \text{graceMinutes}, \quad \text{warningAt} = \text{graceExpiry} - 5\text{m}$$
- **Informational Surge Alerts**: Triggered when active preparation orders reach $\ge 80\%$ of stall capacity; strictly informational and never mutates menu availability.

### 9.8 Connection Safety & Bounded Memory
- **Buffer Overflow Disconnect**: Each client connection maintains a bounded ring buffer (100 frames). Slow consumers whose buffers exceed 100 frames are forcefully disconnected (`BUFFER_OVERFLOW`) to protect server memory.
- **Continuous Session Revalidation**: Background revalidation cycles (every 60s) verify user account activity and stall permissions, forcefully terminating connections (`ACCOUNT_SUSPENDED`, `STAFF_PERMISSION_REVOKED`) upon administrative deactivation.




