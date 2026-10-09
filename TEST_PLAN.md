# CampusEats — Automated Test Plan & Strategy

## 1. Testing Philosophy & Baseline Metrics

> **CRITICAL BASELINE CLARIFICATION:**
> - The previous, lost Android implementation had 35 tests.
> - **THIS NEW CAMPUS EATS WEB PLATFORM STARTED WITH A BASELINE OF 21 PASSING DOMAIN TESTS.**
> - In Phase 0.1, architecture corrections expanded the suite to **42 passing tests across 5 test suites**.
> - In Phase 1 / 1.1 (Domain Model + Database + Persistence + Security Hardening), the suite stood at **57 passing tests across 8 test suites**.
> - In Phase 2 (Backend API Foundation + Authentication + Authorization), the suite stood at **100 passing tests across 13 test suites**.
> - In Phase 2.1 (Authentication Security Corrections & Session Lifecycle), the suite stood at **111 passing tests across 13 test suites with 0 failures**.
> - In Phase 3 (Core Ordering, Menu, Stall Operations & Pickup Scheduling Backend), the suite stood at **129 passing tests across 15 test suites with 0 failures**.
> - In Phase 3.1 (Ordering Hardening, Scheduling Edge Cases & Status Derivation Audit), the suite stood at **136 passing tests across 16 test suites with 0 failures**.
> - In Phase 4 (Student Identity, Verification & Account Lifecycle Backend), the suite now stands at **197 passing tests across 22 test suites with 0 failures**.
> - No false claims or legacy counts are carried into this web platform.

```
+─────────────────────────────────────────────────────────────+
|                     TESTING PYRAMID                         |
|                                                             |
|                    /   E2E Flow   \                         |
|                   /  (Phase 16)    \                        |
|                  /──────────────────\                       |
|                 /  Concurrency &      \                     |
|                /   Failure Invariants   \                   |
|               /──────────────────────────\                  |
|              /    Integration Tests       \                 |
|             /  (DB, Payments, Providers)   \                |
|            /────────────────────────────────\               |
|           /       Domain & Security Unit      \             |
|          /     (State Machines, Scheduling,    \            |
|         /       IDOR/BOLA Scope Authorizers)    \           |
|         +────────────────────────────────────────+          |
+─────────────────────────────────────────────────────────────+
```

---

## 2. Test Suites Matrix

### 2.1 Domain Unit Tests (`tests/unit/domain/`)
- [x] **Advance Payment Minimum**: Rejects any order where advance percentage < 50% or not in `[50, 60, 70, 80, 90, 100]`.
- [x] **Payment Split Calculations**: Accurate rounding to 2 decimal places across multiple sub-orders.
- [x] **Order State Machine Transitions**: Rejects illegal transitions (e.g. `COLLECTED` $\rightarrow$ `PREPARING`, `CANCELLED` $\rightarrow$ `CONFIRMED`).
- [x] **Multi-Stall Decomposition**: Verifies one `MasterOrder` maps to $N$ independent `SubOrder` entities.
- [x] **Refund Isolation**: Verifies rejection of Stall A initiates refund for Stall A's items only, leaving Stall B active.
- [x] **Pickup Scheduling Arithmetic**: Verifies $T_{\text{feasible}} = T_{\text{now}} + T_{\text{prep}} + T_{\text{queue}} + B_{\text{ops}}$.
- [x] **Parallel Kitchen Capacity Reasoning**: Verifies Samosa (10m) + Dosa (8m) on 2 stations takes 10m makespan, not 18m.
- [x] **Dynamic Rescheduling**: Injects sudden queue surge and asserts `SCHEDULE_SHIFTED` event generation.
- [x] **SHA-256 Hash Chain Integrity**: Validates genesis anchoring, hash calculation, tamper detection on mutated payload, previousHash mismatch detection, and sequence gap detection.

### 2.2 Security Unit Tests (`tests/unit/security/`)
- [x] **Student Resource Isolation (IDOR Defense)**: Verifies student cannot access another student's orders or profile.
- [x] **Stall Tenant Isolation (BOLA Defense)**: Verifies Stall Owner A cannot view, mutate, or manage Stall B.
- [x] **Stall Inventory Protection**: Verifies Stall Owner A cannot alter inventory or prices of Stall B.
- [x] **Staff Scope Enforcement**: Verifies staff assigned to Stall A cannot access Stall B.
- [x] **Staff Permission Isolation**: Verifies staff lacking `MANAGE_MENU` cannot alter prices or dishes.
- [x] **Pickup Collection Authorization**: Verifies `STUDENT` is strictly barred from marking an order `COLLECTED`; only authorized staff/owner can.
- [x] **Counter Payment Authorization**: Verifies `STUDENT` cannot self-declare cash payments; only staff with `VIEW_PAYMENTS` can record.
- [x] **Refund Authority Restriction**: Verifies Stall Owners cannot directly execute arbitrary administrative refunds (Admin only).
- [x] **Operating Hours Enforcement**: Verifies stalls cannot be opened outside admin-configured operating schedule.

### 2.3 Concurrency, Invariants & Snapshot Tests (`tests/unit/domain/order-aggregate-snapshots.test.ts`, `tests/integration/checkout-concurrency-transactions.test.ts`)
- [x] **Simultaneous Checkout of Last Stock**: Multiple simultaneous checkout attempts on single stock item. Exactly 1 succeeds; others receive availability/stockout error.
- [x] **Transaction Rollback on Partial Multi-Stall Failure**: When Stall A checkout succeeds but Stall B fails, entire transaction aborts, releasing reserved stock with zero orphan records.
- [x] **Idempotency Record Caching**: Duplicate checkout attempts with identical `Idempotency-Key` return identical stored result without duplicating orders or mutating inventory.
- [x] **Unverified Student Checkout Rejection**: Unverified student is rejected before inventory reservation or order creation.
- [x] **Historical OrderItem Snapshots**: Modifying active menu item price or prep time later does not mutate past historical order items.
- [x] **Multi-Stall Advance Allocation with Zero Penny Drift**: Deterministic proportional allocation with remainder pennies allocated to highest sub-order value.
- [x] **Exact Monetary Arithmetic (Half-Up Policy)**: INR minor-unit / integer paise arithmetic; ₹100 at 50% = ₹50, ₹101 at 50% = ₹50.50.

### 2.4 Database & Persistence Integrity Tests (`tests/integration/prisma-persistence.test.ts`)
- [x] **PostgreSQL Entity Persistence**: Persists and queries Stall, Capacity, Operating Hours, MasterOrder, SubOrder, and OrderItems.
- [x] **Prisma Foreign Key & Schema Integrity**: Ensures relational cascading, compound indices, and unique constraints.
- [x] **Append-Only SHA-256 Hash Chain Database Verification**: Sequential ordering, hash continuity, and cryptographic tamper detection verified against live PostgreSQL, including detecting direct row payload mutation in the database.

### 2.5 Backend API & Security Tests (`tests/integration/api-*.test.ts`)
- [x] **Authentication & Session Lifecycle (`tests/integration/api-auth.test.ts` - 20 tests)**:
  - Registration, duplicate conflict, password complexity validation.
  - Anti-enumeration login (identical generic 401 for wrong email or wrong password).
  - HMAC-signed JWT Bearer token generation & verification (`/api/v1/auth/me`).
  - **Phase 2.1 RefreshSession Creation**: Persists SHA-256 hashed token (`tokenHash`) with active status.
  - **Phase 2.1 Plaintext Invariant**: Plaintext refresh token is never persisted in PostgreSQL.
  - **Phase 2.1 Token Rotation**: `POST /api/v1/auth/refresh` issues new access & refresh tokens and rotates DB session.
  - **Phase 2.1 Rotation Linkage**: Old session is marked revoked and points to new session via `replacedBySessionId`.
  - **Phase 2.1 Old Token Rejection**: Rotated refresh token fails immediately on subsequent use.
  - **Phase 2.1 Replay Attack Detection**: Reuse of rotated token invalidates entire session family and writes `AUTH_REPLAY_DETECTED` audit log.
  - **Phase 2.1 Server-Side Logout**: `POST /api/v1/auth/logout` revokes session family in database.
  - **Phase 2.1 Revoked Token Rejection**: Revoked token cannot be used to refresh.
  - **Phase 2.1 Expired Token Rejection**: Expired sessions reject refresh attempts.
  - **Phase 2.1 Deactivated / Soft-Deleted User Block**: Inactive or soft-deleted accounts cannot refresh.
  - **Phase 2.1 Database Role Authority**: Database role change immediately overrides stale JWT claims (e.g. demoted owner rejected on owner routes).
  - **Phase 2.1 Database Permission Authority**: Removed staff permissions in PostgreSQL immediately block actions even with valid JWT.
- [x] **BOLA / IDOR Defense (`tests/integration/api-authorization-bola.test.ts`)**: Student isolation, stall owner tenant boundary, staff permission checks, admin protection.
- [x] **Checkout & Orders Engine (`tests/integration/api-orders-checkout.test.ts`)**: Verified student checkout, unverified gate rejection, multi-stall decomposition, idempotency replay, stockout failure, order pagination.
- [x] **SubOrder Lifecycle & Refunds (`tests/integration/api-suborders-lifecycle.test.ts`)**: Operational rejection, balance collection barrier, counter cash settlement, administrative isolated refunds, duplicate refund block.
- [x] **Security & Infrastructure (`tests/integration/api-security-infrastructure.test.ts`)**: Health/readiness checks, correlation IDs, Helmet headers, CORS policies, UUID validation, error sanitization, rate limiting, OpenAPI 3.0 specs.

### 2.6 Stall & Menu Management API Tests (`tests/integration/api-stall-menu.test.ts` - 9 tests)
- [x] **Owner Menu Item Creation**: Stall owner creates menu item with authoritative price, prep time, and auto-provisioned inventory.
- [x] **Owner Menu Retrieval**: Stall owner retrieves own menu items with price, prep time, and stock details.
- [x] **Owner Menu Item Update**: Stall owner updates price and prep time.
- [x] **Owner Capacity Update**: Stall owner reconfigures kitchen capacity and parallel cooking lines.
- [x] **Owner Item Availability Toggle**: Stall owner sets item to `SOLD_OUT`.
- [x] **Student Menu Browsing**: Student views live menu with sold-out status accurately reflected.
- [x] **Student Mutation Barrier**: Student blocked from creating, modifying, or deleting menu items (403 `FORBIDDEN`).
- [x] **Cross-Owner BOLA / IDOR Defense**: Stall Owner B cannot modify or delete Stall Owner A's menu items.
- [x] **Soft-Delete Invariant**: Deleting a menu item marks `deletedAt` without destroying historical integrity.

### 2.7 Ordering, Scheduling & Concurrency Tests (`tests/integration/order-scheduling-capacity.test.ts` - 9 tests)
- [x] **Sold-Out Item Ordering Block**: Attempting to order an item marked `SOLD_OUT` is rejected with 400 `ITEM_NOT_AVAILABLE`.
- [x] **Authoritative Pricing**: Manipulated client prices are completely ignored; backend calculates exact prices from PostgreSQL.
- [x] **Pickup Feasibility Rejection**: Infeasible requested pickup time is rejected with structured 400 `code: "PICKUP_TIME_UNAVAILABLE"` containing `requestedTime` and `nextAvailableTime`.
- [x] **Feasible Pickup Acceptance**: Feasible pickup time succeeds and creates an immutable `PickupSchedule` record.
- [x] **Capacity Limit Rejection**: Rejecting checkout when active sub-orders equal or exceed `maxActiveOrders`.
- [x] **Capacity Concurrency Protection**: Simultaneous orders racing for the last capacity slot result in exactly 1 success; the concurrent order is rejected transactionally.
- [x] **Idempotency Race Handling**: Concurrent checkout submissions with identical `Idempotency-Key` return identical stored order without duplicating records.
- [x] **Kitchen Lifecycle Progression**: Sub-order transitions through `CONFIRMED` -> `PREPARING` -> `READY` with verified actor authorization and student notification creation.
- [x] **Cross-Stall Rejection Isolation**: In a multi-stall master order, rejection of SubOrder A leaves SubOrder B completely active and advances MasterOrder to `PARTIALLY_FULFILLED`.

### 2.8 Ordering Hardening, Scheduling Edge Cases & Status Derivation Audit (`tests/integration/phase3-hardening-invariants.test.ts` - 6 tests)
- [x] **Multi-Stall Inventory Rollback Invariant**: When multi-stall checkout reserves Stall A items, and Stall B subsequently fails validation/operating hours, Stall A stock is 100% restored to original available levels, reserved count is 0, zero orders are created, and in-flight idempotency record is deleted for immediate retry.
- [x] **Pickup Scheduling Late Edge Case**: Requested pickup time after stall closing time is rejected with 400 `PICKUP_TIME_UNAVAILABLE` and returns structured `nextAvailableTime` from the next operating window.
- [x] **Current Time Outside Operating Hours Edge Case**: Order placement when stall is currently outside operating hours is rejected with `outside official campus operating hours`.
- [x] **Feasible Pickup Slot Acceptance**: Requested pickup time within operating window exceeding preparation + buffer time is accepted with confirmed pickup schedule.
- [x] **Dynamic MasterOrder Status Derivation**: MasterOrder status is authoritatively and dynamically computed from child sub-orders. In a multi-stall order where SubOrder C is `REJECTED` and SubOrder A is `PREPARING`/`READY`, `GET /api/v1/orders/:id` returns `status: "PARTIALLY_FULFILLED"` without stale database column drift.
- [x] **Counter Settlement Payment-State Semantics**: Confirms `POST /api/v1/orders/suborder/:id/counter-settlement` is strictly an internal cash/counter payment-state transition (no external gateway calls), blocks student self-declaration (403), blocks pickup collection before settlement (400), allows collection after settlement (200), and blocks duplicate counter settlement (400).

### 2.9 Student Identity, Verification & Account Lifecycle Tests (Phase 4 - 59 new tests across 6 suites)
- [x] **Verification State Machine & Ordering Eligibility (`tests/unit/domain/verification-state-machine.test.ts` - 12 tests)**:
  - Valid transitions: `PENDING_SUBMISSION` $\rightarrow$ `UNDER_REVIEW` $\rightarrow$ `ACTIVE`.
  - Rejection & resubmission: `UNDER_REVIEW` $\rightarrow$ `REJECTED` $\rightarrow$ `PENDING_SUBMISSION` / `UNDER_REVIEW`.
  - Administrative suspension & reactivation: `ACTIVE` $\rightarrow$ `SUSPENDED` $\rightarrow$ `ACTIVE`.
  - Rejection of invalid arbitrary transitions (e.g. `ACTIVE` $\rightarrow$ `PENDING_SUBMISSION`, `REJECTED` $\rightarrow$ `ACTIVE` without review).
  - 4-Pillar ordering eligibility evaluation (User active + STUDENT role + Account active + Verification active).
  - Ordering blocked for deactivated users, non-students, suspended students, rejected students, and unverified students.
  - Validation of all structured rejection reason codes and rejection of invalid codes.
- [x] **Document Content Validation & Malware Defense (`tests/unit/domain/document-validation.test.ts` - 13 tests)**:
  - Magic byte validation for genuine PDF (`%PDF`), JPEG (`FF D8 FF`), and PNG (`89 50 4E 47 0D 0A 1A 0A`).
  - Rejection of empty buffers and oversized documents (>5MB).
  - Rejection of disguised Windows executables (`MZ` header), Linux ELF binaries, and ZIP archives (`PK` header).
  - Rejection of embedded script/HTML injections (`<script>`, `<html`, `onload=`) and PHP code (`<?php`).
  - Filename sanitization, neutralization of directory traversal sequences (`../`, `..\\`), and control character removal.
- [x] **Storage Abstraction & HMAC-Signed Token Security (`tests/unit/domain/storage-provider.test.ts` - 7 tests)**:
  - Private filesystem upload returning metadata with unguessable UUID storage key.
  - HMAC-SHA256 signed temporary download URL generation with 5-minute expiry.
  - Expiration enforcement: expired signed tokens rejected with 403.
  - Tamper resistance: forged signatures or altered storage paths rejected.
  - `getSignedFile`: verifies signature and expiration inside provider boundary before returning raw document bytes.
  - Directory traversal prevention in `getSignedUrl` and `getFile`.
  - Idempotent object deletion.
- [x] **Student Verification API & IDOR Security (`tests/integration/api-student-verification.test.ts` - 13 tests)**:
  - `GET /api/v1/student/profile`: Returns authenticated student profile; non-students rejected.
  - Profile IDOR: Student A cannot retrieve Student B's profile.
  - `GET /api/v1/student/verification/status`: Returns current verification state and ordering eligibility flag.
  - `POST /api/v1/student/verification/document`: Submits valid document; multipart/form-data strictly enforced; JSON Base64 uploads rejected with 400; client-supplied userId ignored; state transitions to `UNDER_REVIEW`; audit log and notification created.
  - File upload validation: rejects fake MIME types with executable contents, rejects files > 5MB, rejects unsupported extensions.
  - Document access: Student A can obtain signed URL for own document; Student A cannot access Student B's document (IDOR blocked).
  - Stall owner and staff blocked from student verification endpoints (403 Forbidden).
- [x] **Admin Verification Lifecycle & Account Suspension (`tests/integration/api-admin-verification-lifecycle.test.ts` - 13 tests)**:
  - `GET /api/v1/admin/verifications`: Admin can list verification queue with status filters; non-admins rejected (403).
  - `GET /api/v1/admin/verifications/:id/document/url`: Admin can obtain signed URL to review student document.
  - `POST /api/v1/admin/verifications/:id/approve`: Approves verification, transitions status to `ACTIVE`, unlocks checkout, logs audit action, creates notification.
  - `POST /api/v1/admin/verifications/:id/reject`: Rejects verification with structured reason code; checkout remains locked; student can resubmit.
  - Rejects arbitrary/invalid rejection reason codes.
  - `POST /api/v1/admin/students/:id/suspend`: Suspends active student; immediately blocks checkout (403).
  - `POST /api/v1/admin/students/:id/reactivate`: Reactivates student; restores ordering eligibility.
  - Reactivation does not bypass unverified status (reactivated unverified student remains blocked from checkout).
- [x] **Verification Concurrency & State Safety (`tests/integration/verification-concurrency.test.ts` - 3 tests)**:
  - Concurrent approval: Two admins approving the same verification simultaneously result in exactly 1 success (200) and 1 conflict (409) via row locking.
  - Concurrent approve vs reject: Exactly one transition succeeds; second is rejected with 409 Conflict.
  - Suspended student racing checkout concurrently: Database-authoritative account check blocks checkout across all parallel requests.

---

## 3. Execution Commands

```bash
# Run all unit tests
npm test

# Run with test coverage analysis
npm run test:coverage

# Run domain specific tests
npx jest tests/unit/domain

# Run security tests
npx jest tests/unit/security
```
