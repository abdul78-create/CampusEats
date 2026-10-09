# Changelog

All notable changes to the CampusEats platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-09-25 — Phase 4: Student Identity, Verification & Account Lifecycle Backend

### Added & Hardened
- **Authoritative Verification State Machine (`VerificationStateMachine`)**:
  - Authoritative lifecycle state transitions: `PENDING_SUBMISSION` $\rightarrow$ `UNDER_REVIEW` $\rightarrow$ `ACTIVE` | `REJECTED` $\rightarrow$ `PENDING_SUBMISSION`, `ACTIVE` $\leftrightarrow$ `SUSPENDED`.
  - Rejection of invalid arbitrary transitions, self-transitions, and skipped statuses.
  - Integration of 8 authoritative structured rejection reason codes: `INVALID_DOCUMENT`, `DOCUMENT_UNREADABLE`, `WRONG_DOCUMENT_TYPE`, `IDENTITY_MISMATCH`, `EXPIRED_DOCUMENT`, `INSUFFICIENT_INFORMATION`, `DUPLICATE_SUBMISSION`, `OTHER`.
- **4-Pillar Ordering Eligibility Gate**:
  - Decoupled authentication state, account lifecycle state, and verification status.
  - Requires: `User.isActive` + `User.role === STUDENT` + `StudentProfile.accountStatus === ACTIVE` + `StudentVerification.status === ACTIVE`.
  - Untrusted JWT claims: live database-authoritative verification required on checkout; unverified and suspended students blocked.
- **Document Content Validation & Anti-Malware Defense (`DocumentValidationService`)**:
  - Authoritative server-side magic byte inspection: PDF (`%PDF`), JPEG (`FF D8 FF`), PNG (`89 50 4E 47 0D 0A 1A 0A`).
  - Active disguise defense: blocks disguised Windows MZ binaries, Linux ELF executables, ZIP/Office archives, embedded scripts/HTML, and PHP payloads.
  - Strict 5MB file size limit enforcement.
  - Filename sanitization with directory traversal neutralization (`../`, `..\\`, control characters, non-alphanumeric chars).
- **Private Storage Abstraction & Token Security (`IStorageProvider`, `LocalStorageProvider`)**:
  - Private filesystem storage outside web root (`./storage/uploads`) using server-generated unguessable UUID storage keys.
  - Zero raw binary document bytes stored in PostgreSQL (metadata, storage path, and SHA-256 checksums only).
  - Short-lived HMAC-SHA256 signed temporary download URLs (5-minute TTL) with signature verification and directory traversal defense.
  - Architectural encapsulation: raw file bytes accessible strictly via `getSignedFile(storagePath, expires, signature)`; higher layers cannot bypass authorization.
- **Student Profile & Verification API (`StudentVerificationController`)**:
  - `GET /api/v1/student/profile`: Returns authenticated student profile with strict BOLA/IDOR protection.
  - `GET /api/v1/student/verification/status`: Queries current verification status, rejection reason, and ordering eligibility flag.
  - `POST /api/v1/student/verification/document`: Submits identity document via `multipart/form-data` with 5 MB actual-file limit; JSON Base64 uploads strictly rejected; ignores client-supplied userId; creates verification and identity document records in PostgreSQL; triggers audit log and notification.
  - `GET /api/v1/student/verification/document/:id/url`: Generates temporary HMAC-signed URL for authenticated student's own document (cross-student access blocked).
- **Admin Verification Queue & Lifecycle Adjudication (`AdminVerificationController`)**:
  - `GET /api/v1/admin/verifications`: Lists verification applications with status filtering and deterministic pagination.
  - `GET /api/v1/admin/verifications/:id/document/url`: Provides authorized document review access for platform admins.
  - `POST /api/v1/admin/verifications/:id/approve`: Approves verification, transitions status to `ACTIVE`, activates student profile, logs audit action, creates notification.
  - `POST /api/v1/admin/verifications/:id/reject`: Rejects application with structured reason code and notes; locks checkout.
  - `POST /api/v1/admin/students/:id/suspend`: Administratively suspends student account; immediately blocks ordering server-side.
  - `POST /api/v1/admin/students/:id/reactivate`: Reactivates student account; enforces that unverified students remain blocked.
- **Concurrency & State Safety**:
  - Transactional pessimistic row locks (`SELECT FOR UPDATE`) on `StudentVerification` and `StudentProfile`.
  - Prevents race conditions during concurrent approval/rejection (exactly 1 valid transition succeeds, competing request receives HTTP 409 Conflict).
- **Security Audit Events & Persistent Notifications**:
  - SHA-256 hash-chain audit logging: `STUDENT_DOCUMENT_SUBMITTED`, `VERIFICATION_REVIEW_STARTED`, `VERIFICATION_APPROVED`, `VERIFICATION_REJECTED`, `STUDENT_SUSPENDED`, `STUDENT_REACTIVATED`, `STUDENT_DOCUMENT_ACCESSED`.
  - Zero logging of passwords, tokens, raw file contents, or signed URLs.
  - Persistent `Notification` records generated on all verification and account lifecycle events.
- **OpenAPI 3.0 Documentation**:
  - Added full request/response schemas, authentication requirements, and error definitions for all Phase 4 endpoints.
- **Automated Test Suite Expansion**:
  - Added 59 new tests across 6 new test suites.
  - Total test count: **195 tests passing across 22 test suites with 0 failures** (baseline: 136 tests / 16 suites in Phase 3.1).

### Verified
- **Frontend 100% Frozen**: 0 React components, 0 React pages, 0 CSS, 0 HTML, 0 dashboards.
- **Clean Compilation**: `npm run prisma:generate`, `npm run typecheck`, and `npm run build` pass cleanly with 0 errors.

## [0.4.1] - 2026-09-25 — Phase 3.1: Ordering Invariants, Scheduling Edge Cases & Status Derivation Audit

### Hardened & Verified
- **Multi-Stall Inventory Rollback Invariant**:
  - Verified and tested multi-stall checkout transaction boundaries. When Stall A stock is reserved and Stall B subsequent validation fails, Stall A's stock is 100% rolled back to initial available levels (`availableQuantity` restored, `reservedQuantity` cleared), zero `MasterOrder`/`SubOrder` records exist in PostgreSQL, and the in-flight idempotency record is cleared for immediate student retry.
- **Pickup Scheduling Edge Cases & Next Operating Window**:
  - `StallOperatingPolicy.assertPickupWithinOperatingHours`: Enforces that scheduled pickup times and preparation completion times fall within official stall operating hours.
  - Preparation crossing stall closing time is rejected with structured 400 `code: "PICKUP_TIME_UNAVAILABLE"`.
  - Next operating window calculation: Authoritative `nextAvailableTime` is computed from the next open operating window.
  - Rejects orders placed when stall is currently outside campus operating hours.
- **Authoritative Dynamic MasterOrder Status Derivation**:
  - `MasterOrderAggregate.status` and `OrderController` dynamically derive `status` from child sub-orders using `OrderStateValidator.deriveMasterOrderStatus`.
  - Solved status desynchronization: In a multi-stall order where SubOrder C is `REJECTED` and SubOrder A is `PREPARING` or `READY`, `masterOrder.status` authoritatively derives `PARTIALLY_FULFILLED` without database column drift.
  - `PrismaOrderRepository.saveSubOrder`: Atomically recomputes and updates parent `MasterOrder.status` in PostgreSQL transaction on any sub-order state transition.
- **Counter Settlement Internal Payment Semantics**:
  - Explicitly verified and documented that `POST /api/v1/orders/suborder/:id/counter-settlement` represents an internal payment-state transition (physical cash handover at counter), NOT external bank/UPI gateway integration.
  - Enforced that students cannot self-declare counter settlements (403), food cannot be collected prior to remaining balance settlement (400), and duplicate counter settlements are blocked (400).
- **Automated Test Suite Expansion**:
  - Created `tests/integration/phase3-hardening-invariants.test.ts` (6 tests).
  - Added dynamic partially fulfilled derivation test in `tests/unit/domain/order-state-machine.test.ts` (+1 test).
  - Suite metric: **136 tests passing across 16 suites with 0 failures** (baseline: 129 tests across 15 suites in Phase 3; 111 tests across 13 suites in Phase 2.1).

### Verified
- **Frontend 100% Frozen**: 0 React components, 0 React pages, 0 CSS files, 0 HTML templates, 0 dashboards.
- **Typecheck & Production Build**: 0 errors on `npm run typecheck` and `npm run build`.

## [0.4.0] - 2026-09-25 — Phase 3: Core Ordering, Menu, Stall Operations & Pickup Scheduling Backend

### Added & Hardened
- **Stall & Menu Operations Engine (`OwnerStallController`)**:
  - Full owner CRUD endpoints for menu items with automatic inventory record creation (`POST /api/v1/owner/stall/menu`).
  - Owner price, description, preparation time, and availability updates (`PATCH /api/v1/owner/stall/menu/:itemId`, `PATCH /api/v1/owner/stall/menu/:itemId/availability`).
  - Soft deletion of menu items (`DELETE /api/v1/owner/stall/menu/:itemId`).
  - Dynamic capacity configuration updates (`PATCH /api/v1/owner/stall/capacity`).
  - Student public discovery of stalls and menus (`GET /api/v1/stalls`, `GET /api/v1/stalls/:id`, `GET /api/v1/stalls/:id/menu`).
  - Strict BOLA/IDOR protection preventing cross-stall manipulation and blocking students from modifying menus.
- **Backend-Authoritative Pricing & Advance Rules**:
  - Client-submitted prices and prep times are discarded; live database menu item prices are authoritatively queried.
  - Advance percentages strictly restricted to `50, 60, 70, 80, 90, 100` with Half-Up paise calculation and zero penny drift.
  - Sold-out / inactive items rejected before order creation.
- **Multi-Stall Checkout & Sub-Order Aggregate Isolation (`MasterOrder != SubOrder`)**:
  - Multi-stall cart decomposition into single `MasterOrder` with independent `SubOrder` records per stall.
  - Isolated sub-order rejection: failure or rejection of one stall does not cancel unrelated sub-orders; master derives `PARTIALLY_FULFILLED`.
- **Concurrency & Transaction Safety**:
  - PostgreSQL transaction (`$transaction`) wrapping inventory decrement, capacity check, and order persistence.
  - Concurrency test: race condition on final inventory stock results in exactly 1 successful checkout.
  - Concurrency test: simultaneous orders hitting max capacity slots result in exactly 1 acceptance and transactional rejection of the overflow.
  - Checkout idempotency: in-flight key reservation blocks race duplicates; replays return cached order response.
- **Intelligent Pickup Scheduling (`InfeasiblePickupTimeError`)**:
  - Feasibility validation factoring operating hours, stall operational status (`OPEN`), prep workload, and buffer.
  - Structured rejection: `code: "PICKUP_TIME_UNAVAILABLE"` providing `requestedTime` and authoritative `nextAvailableTime`.
  - Persistence of `PickupSchedule` records linked to each sub-order.
- **Sub-Order Lifecycle & Kitchen Processing**:
  - Owner endpoints for kitchen progression: `POST /api/v1/orders/suborder/:id/confirm`, `prepare`, `ready`, and `collect`.
  - Student notification records created on order placement and readiness.
  - Pickup collection restricted to stall owner or authorized staff; students cannot self-collect.
- **OpenAPI 3.0 Documentation**:
  - Updated specification at `/api/v1/spec` with all Phase 3 endpoints, request schemas, and error structures.
- **Integration Tests Added**:
  - `tests/integration/api-stall-menu.test.ts` (9 tests)
  - `tests/integration/order-scheduling-capacity.test.ts` (9 tests)
  - Suite metric: **129 tests passing across 15 suites, 0 failures** (baseline: 111 tests / 13 suites).

### Verified
- **Frontend 100% Frozen**: 0 React components, 0 React pages, 0 CSS, 0 HTML, 0 dashboards.
- **Clean Compilation**: `npm run prisma:generate`, `npm run typecheck`, and `npm run build` pass with 0 errors.

## [0.3.1] - 2026-09-25 — Phase 2.1: Authentication Security Corrections & Session Lifecycle

### Added & Hardened
- **Server-Side Refresh Session Architecture (`RefreshSession`)**:
  - Expanded relational schema to 23 core models with `RefreshSession` table in PostgreSQL.
  - Plaintext refresh tokens are NEVER stored in PostgreSQL; persisted strictly as deterministic SHA-256 digests (`tokenHash`).
  - Refresh tokens contain unique cryptographic UUID `jti` ensuring independent cryptographic fingerprints.
- **Single-Use Refresh Token Rotation & Replay Attack Defense**:
  - Dedicated endpoint `POST /api/v1/auth/refresh` validating signatures, database session hash, user active status, and expiration.
  - Atomically marks previous session as revoked with `replacedBySessionId` and creates new session in the same `familyId`.
  - Replay defense protocol: reuse of an already-rotated or revoked token immediately triggers token family invalidation and persists an `AUTH_REPLAY_DETECTED` audit log record.
- **Server-Side Logout Revocation**:
  - `POST /api/v1/auth/logout` sets `revokedAt = NOW()` across active refresh sessions in PostgreSQL, ensuring stolen or discarded refresh tokens fail immediately on subsequent presentation.
  - Audit logging for `AUTH_LOGOUT` and `AUTH_TOKEN_ROTATED` with sanitized metadata (no passwords, tokens, or hashes).
- **Database-Authoritative Authorization**:
  - `requireAuth` middleware verifies access tokens against live database state on every protected request.
  - Current role, active status (`isActive`), soft-delete flag (`deletedAt`), stall tenant ownership, and delegated staff permissions are dynamically resolved from PostgreSQL, ensuring immediate privilege revocation even with unexpired JWT access tokens.
- **Terminology Corrections**:
  - Replaced all occurrences of "asymmetric-style JWT" with "HMAC-signed JWT Bearer tokens" throughout documentation and OpenAPI specifications.
- **Automated Lifecycle Integration Tests**:
  - Expanded `tests/integration/api-auth.test.ts` from 9 to 20 tests covering all 12 requested authentication security and session lifecycle scenarios.
  - Suite metric: **111 tests passing across 13 suites, 0 failures**.

### Verified
- **Frontend 100% Frozen**: 0 React components, 0 React pages, 0 CSS, 0 HTML, 0 dashboards.
- **Typecheck & Build**: Clean compilation with 0 errors.

## [0.3.0] - 2026-09-24 — Phase 2: Production Backend API Foundation + Authentication + Authorization

### Added
- **HTTP Server & Routing Infrastructure**:
  - Express.js HTTP modular monolith foundation in `src/app.ts` and `src/server.ts`.
  - API versioning under `/api/v1/...`.
  - Liveness (`GET /health`) and readiness (`GET /ready` verifying PostgreSQL connectivity) probes.
  - Correlation ID middleware (`req.id`, `X-Request-ID`) tracking all requests.
  - Centralized, sanitized error handling middleware (`errorHandlerMiddleware`) preventing SQL, Prisma, and stack trace leaks.
  - Security headers using `helmet` (`nosniff`, `frameguard`).
  - Restrictive CORS policy supporting environment-configurable allowed origins and blocking untrusted origins with 403 `CORS_FORBIDDEN`.
  - Rate limiting via `express-rate-limit` for authentication (`authRateLimiter`), checkout (`checkoutRateLimiter`), and administrative mutations (`adminRateLimiter`).
  - OpenAPI 3.0.3 specification at `/api/v1/spec` and documentation endpoint `/api/v1/docs`.
- **Authentication & Session Architecture**:
  - `TokenService`: Secure password hashing using bcrypt (salt rounds = 12) with constant-time dummy hash verification against timing attacks.
  - JWT token architecture: 15-minute access token and 7-day refresh token with claims `{ userId, role, email }`.
  - `AuthService`: Anti-enumeration student registration and login with constant-time password verification.
  - Strict security: Password hashes and sensitive internal credentials excluded from all DTOs and responses.
  - Endpoints: `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`.
- **Authorization & Multi-Tenant BOLA/IDOR Defense**:
  - Middleware: `requireAuth`, `requireRole`, `requirePermission`, `requireVerifiedStudent`.
  - Multi-tenant resource scoping:
    - Students can access only their own profile, orders, and notifications.
    - Stall owners can access and mutate only their owned stall menu, inventory, and orders.
    - Stall staff can operate only within assigned stalls with verified explicit permissions (`MANAGE_ORDERS`, `VIEW_PAYMENTS`).
    - Administrative operations isolated under `/api/v1/admin/...` requiring `ADMIN` role.
  - Server-side derivation: Client-supplied userIds, stallIds, and roles are NEVER trusted.
- **Business Operations & Controllers**:
  - `OrderController`: Student checkout calling `CheckoutService` with verification gate, inventory reservation, multi-stall decomposition, scheduling, idempotency, and paginated order retrieval.
  - `SubOrderController`: Operational rejection by stall owner, counter cash settlement with audit logging, and pickup collection with remaining balance checks.
  - `StallController` & `OwnerStallController`: Stall public browsing, stall owner live status updates with operating hours gate, inventory adjustments, and vendor queue viewing.
  - `AdminController`: Official stall operating hours updates, administrative isolated refunds, audit chain verification (`/api/v1/admin/audit/verify-chain`), and paginated audit logs.
- **Automated Integration & Security Tests**:
  - 5 comprehensive integration test suites (+43 tests):
    - `tests/integration/api-auth.test.ts` (9 tests)
    - `tests/integration/api-authorization-bola.test.ts` (10 tests)
    - `tests/integration/api-orders-checkout.test.ts` (6 tests)
    - `tests/integration/api-suborders-lifecycle.test.ts` (7 tests)
    - `tests/integration/api-security-infrastructure.test.ts` (11 tests)
  - Progression: Phase 0 (21) $\rightarrow$ Phase 0.1 (42) $\rightarrow$ Phase 1 (54) $\rightarrow$ Phase 1.1 (57) $\rightarrow$ **Phase 2 (100 exact passing tests across 13 test suites, 0 failures)**.

### Verified
- **Frontend Frozen**: 0 React components, 0 React pages, 0 CSS files, 0 HTML templates, 0 dashboard UIs.
- **Clean Compilation**: `npm run prisma:generate`, `npm run typecheck`, and `npm run build` pass with 0 errors.

## [0.2.0] - 2026-09-24 — Phase 1: Domain Model + Database + Persistence Implementation

### Added
- **Domain Aggregates & Value Objects**:
  - `MasterOrderAggregate`: Multi-stall decomposition, one sub-order per stall invariant, derived composite state machine, Half-Up INR rounding policy, deterministic zero penny drift advance allocation.
  - `SubOrderAggregate`: Full lifecycle management (`PENDING_PAYMENT` $\rightarrow$ `PAYMENT_CONFIRMED` $\rightarrow$ `CONFIRMED` $\rightarrow$ `PREPARING` $\rightarrow$ `READY` $\rightarrow$ `COLLECTED`), isolated rejection, cancellation, refunding, and expiry.
  - `OrderItemSnapshot`: Immutable historical snapshot capturing item name, unit price, preparation minutes, and attributes at checkout.
  - `OrderNumber`: Human-friendly order identifiers (`CE-YYYYMMDD-XXXXXX`) separate from internal UUID primary keys.
  - `InventoryRecord`: Atomic inventory decrement, reservation, and release invariants preventing negative stock.
  - `StallAggregate`: Separation of administrative operating hours from operational live counter states.
- **Database & Persistence Layer (Prisma + PostgreSQL)**:
  - Initial database migration `20260924160628_init` applied to PostgreSQL 16 (`docker-compose.yml`).
  - Repository interfaces in application/domain layer: `IOrderRepository`, `IStallRepository`, `IInventoryRepository`, `IAuditLogRepository`, `IIdempotencyRepository`, `IUserRepository`.
  - Concrete Prisma infrastructure implementations: `PrismaOrderRepository`, `PrismaStallRepository`, `PrismaInventoryRepository`, `PrismaAuditLogRepository`, `PrismaIdempotencyRepository`, `PrismaUserRepository`.
  - Transaction-safe atomic checkout orchestrator: `CheckoutService` executing multi-stall stock reservations, MasterOrder creation, SubOrder persistence, and Idempotency key tracking inside atomic transaction boundaries with full rollback on partial failure.
  - Row-level atomic conditional stock reservation (`UPDATE "MenuItemInventory" SET "availableQuantity" = "availableQuantity" - :qty, "reservedQuantity" = "reservedQuantity" + :qty WHERE "menuItemId" = :id AND "availableQuantity" >= :qty`).
  - Append-only application semantics with SHA-256 hash-chain integrity verification persisted to PostgreSQL with unbroken chain validation and tamper detection.
- **Automated Tests**:
  - 3 new test suites added (+12 tests):
    - `tests/unit/domain/order-aggregate-snapshots.test.ts` (5 tests)
    - `tests/integration/checkout-concurrency-transactions.test.ts` (4 tests)
    - `tests/integration/prisma-persistence.test.ts` (4 tests)
    - `tests/unit/domain/audit-hash-chain.test.ts` (expanded to 5 tests covering all 7 audit chain invariants)
  - Total test count expanded: **57 passing tests across 8 test suites (0 failures)**.

### Verified
- **Frontend Frozen**: Confirmed 0 React components, 0 CSS styles, 0 HTML/pages, 0 UI mockups created.
- **Clean Compilation**: `npm run prisma:generate`, `npm run typecheck`, and `npm run build` pass with zero errors.

## [0.1.1] - 2026-09-24 — Phase 0.1: Architecture Corrections & Hardening

### Added
- **Resource-Level Authorization (IDOR & BOLA Defense)**:
  - Created `ResourceScopeAuthorizer` enforcing `Role + Permission + Resource Scope`.
  - Added unit test suite `tests/unit/security/resource-authorization.test.ts` (20 security tests).
  - Explicit gates preventing students from marking orders `COLLECTED` or self-declaring counter payments.
- **Counter Payment Authorization**:
  - Separated Online Balance Payment (`/payments/balance/online`) from Counter Handover Settlement (`/orders/suborder/:id/counter-settlement`).
- **Parallel Capacity Multiprocessor Scheduling**:
  - Implemented Longest Processing Time (LPT) makespan algorithm in `PickupSchedulingService`.
  - Added unit test proving parallel cooking across stations (e.g. Samosa 10m + Dosa 8m on 2 stations = 10m makespan, not 18m).
- **Stall Operating Hours vs Live Status Separation**:
  - Created `StallOperatingPolicy` enforcing administrative governance over operating hours and owner control of live counter status (`OPEN`, `BUSY`, `TEMPORARILY_PAUSED`, `CLOSED`).
  - System rejects `OPEN` transition and order intake outside admin-configured hours.
- **Refund Flow Authority Correction**:
  - Restricted direct administrative refunds to `ADMIN`. Stall owners trigger refund eligibility through operational rejection or cancellation.

### Changed
- Clarified baseline test metrics: Documented that the lost Android app had 35 tests; this new web platform established an initial baseline of 21 domain tests, expanded in Phase 0.1 to **42 passing tests across 5 test suites**.
- Updated `API_SPEC.md`, `PAYMENT_SPEC.md`, `REFUND_SPEC.md`, `STALL_OPERATIONS.md`, `IDENTITY_VERIFICATION.md`, `SECURITY.md`, `DOMAIN_MODEL.md`, `TEST_PLAN.md`.
- Updated identity terminology to "Device-side liveness verification" for current development implementation.
- Updated payment terminology to "UPI payment initiation + transaction/reconciliation infrastructure".

## [0.1.0] - 2026-09-24 — Phase 0: Product Constitution & Requirements Freeze

### Added
- **Product Constitution & Specifications**:
  - `README.md`: Executive summary, problem definition, role catalog, staged roadmap.
  - `PRODUCT_SPEC.md`: Complete business rules, student lifecycle, advance payment rules, multi-stall splitting, and stall states.
  - `ARCHITECTURE.md`: Modular monolith design, bounded contexts, layer separation, provider contracts.
  - `DOMAIN_MODEL.md`: Ubiquitous language, aggregate roots, entities, value objects, domain invariants.
  - `DATABASE_SCHEMA.md`: PostgreSQL schema specification, indices, constraints, precision rules, soft-delete strategy.
  - `ORDER_STATE_MACHINE.md`: Strict transition tables for `MasterOrder` and `SubOrder`, forbidden transitions.
  - `PAYMENT_SPEC.md`: Mandatory 50%-100% advance deposit tiering, UPI flow, settlement rules, idempotency.
  - `REFUND_SPEC.md`: Fault-isolated cancellation and refund policies, audit logging of reversals.
  - `SCHEDULING_ENGINE.md`: Dynamic pickup scheduling arithmetic, queue delay modeling, `SCHEDULE_SHIFTED` events.
  - `STALL_OPERATIONS.md`: Live status vs. operating hours, manual vs. automatic acceptance strategies, capacity parameters, menu snapshots.
  - `IDENTITY_VERIFICATION.md`: 3-challenge liveness verification provider abstraction, file upload security, data minimization.
  - `SECURITY.md`: RBAC matrix, token strategy, PII masking, Helmet headers, rate limiting.
  - `API_SPEC.md`: RESTful endpoint catalog, standard error envelope, OpenAPI structure.
  - `REALTIME_ARCHITECTURE.md`: Event types, deduplication, sequence gap detection, WebSocket/SSE transports.
  - `AUDIT_LOG_SPEC.md`: Tamper-evident SHA-256 cryptographically hash-chained audit trail.
  - `TEST_PLAN.md`: Comprehensive test matrix spanning domain, security, concurrency, integration, and failure modes.
  - `DEPLOYMENT.md`: Infrastructure topology, environments, migration strategies, health checks.
  - `DEVELOPMENT.md`: Setup instructions, development scripts, and contribution rules.
- **Architecture Decision Records (ADRs)**:
  - `ADR-001`: Modular Monolith Architecture over Microservices.
  - `ADR-002`: Two-Tier Order and Sub-Order State Machine.
  - `ADR-003`: Partial Advance Payment (50%-100%) and Fault-Isolated Refunds.
  - `ADR-004`: Mathematical Pickup Scheduling and Dynamic Queue Engine.
  - `ADR-005`: Cryptographically Hash-Chained Audit Log with SHA-256.
  - `ADR-006`: Provider Abstractions for External Infrastructure.
  - `ADR-007`: Data Minimization and Masked PII Exposure.
  - `ADR-008`: Idempotency Keys and Concurrency Control.
- **Backend Foundation & Database**:
  - `prisma/schema.prisma`: Complete PostgreSQL schema with 22 core relational models, relations, indices, enums, and audit chaining.
  - `package.json`, `tsconfig.json`, `jest.config.ts`, `.env.example`, `.gitignore`.
  - Shared domain primitives (`AggregateRoot`, `Entity`, `ValueObject`, `DomainError`).
  - Domain enums, interfaces, and value objects across modules.
  - Provider contracts: `LivenessVerificationProvider`, `PaymentProvider`, `StorageProvider`, `RealtimeGatewayProvider`.
  - Strategy contracts: `OrderAcceptanceStrategy`, `ManualOrderAcceptanceStrategy`, `AutomaticOrderAcceptanceStrategy`.
  - Minimal server scaffolding with `/health` and `/api/v1/health` endpoints.
- **Automated Tests**:
  - Domain unit tests for order state machine transitions, advance payment rules, pickup scheduling math, and SHA-256 audit chaining.

### Changed
- None (Initial Phase 0 release).

### Deprecated
- None.

### Removed
- None.

### Fixed
- None.

### Security
- Explicit policy forbidding unverified students from ordering.
- PII masking utilities for registration numbers, phone numbers, and UPI handles.
- Immutable historical order item snapshots to prevent menu price tampering.
