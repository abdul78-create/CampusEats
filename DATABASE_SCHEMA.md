# CampusEats — Database Architecture Specification

## 1. Relational Database Overview

CampusEats relies on **PostgreSQL** as its source of operational truth. The schema is formally defined in [schema.prisma](prisma/schema.prisma) and enforced via typed migrations.

The database architecture comprises **23 core relational models** partitioned across Identity, Stall Operations, Ordering, Payments, Audit, and System notifications.

### Key Database Design Principles
1. **Strong Referential Integrity**: Explicit foreign key relationships ensure orphaned order items, unlinked payments, or untracked audit logs cannot exist.
2. **Deterministic Financial Precision**: All financial amounts use integer minor units (paise) and `DECIMAL(10, 2)` mappings to prevent floating-point rounding errors.
3. **Compound Indexes for Query Performance**: Crucial query paths (e.g. active queue lookups by `(stallId, status)`, student orders by `(studentId, createdAt)`) are indexed.
4. **Soft-Delete Support**: `deletedAt` timestamps on entities like `User`, `Stall`, and `MenuItem` prevent accidental hard deletion of historical records.
5. **Idempotency Persistence**: The `IdempotencyRecord` table maintains state for 24 hours to prevent duplicate transactions.
6. **Tamper-Evident Audit Logging**: Append-only application semantics with SHA-256 hash-chain integrity verification.
7. **Secure Refresh Session Fingerprinting**: `RefreshSession` stores deterministic SHA-256 token digests (`tokenHash`), tracking session families, rotation replacements, and revocation without persisting plaintext tokens.

---

## 2. Entity Relationship Overview (23 Core Models)

```
 [User] 1:1 [StudentProfile] 1:N [StudentVerification] 1:1 [IdentityDocument]
   │                                                 1:1 [LivenessVerification]
   ├── 1:N [RefreshSession] (Hashed single-use sessions with rotation & replay defense)
   ├── 1:N [Stall] (as Owner)
   │        ├── 1:N [StallOperatingHour]
   │        ├── 1:1 [StallCapacity]
   │        ├── 1:N [StaffAccount] 1:N [StaffPermission]
   │        ├── 1:N [MenuItem] 1:1 [MenuItemInventory]
   │        └── 1:N [SubOrder]
   │
   ├── 1:N [MasterOrder]
   │        ├── 1:N [SubOrder]
   │        │        ├── 1:N [OrderItem]
   │        │        ├── 1:1 [PickupSchedule]
   │        │        └── 0:1 [Refund]
   │        └── 1:N [Payment] 1:N [PaymentTransaction]
   │
   ├── 1:N [Notification]
   ├── 1:N [AuditLog] (Actor link, append-only SHA-256 chained)
   └── [IdempotencyRecord] (Scoped key-value operational cache)
```

The 23 core relational models are:
1. `User`, 2. `StudentProfile`, 3. `StudentVerification`, 4. `IdentityDocument`, 5. `LivenessVerification`,
6. `RefreshSession`, 7. `Stall`, 8. `StallOperatingHour`, 9. `StallCapacity`, 10. `StaffAccount`, 
11. `StaffPermission`, 12. `MenuItem`, 13. `MenuItemInventory`, 14. `MasterOrder`, 15. `SubOrder`, 
16. `OrderItem`, 17. `PickupSchedule`, 18. `Payment`, 19. `PaymentTransaction`, 20. `Refund`, 
21. `AuditLog`, 22. `IdempotencyRecord`, 23. `Notification`.

---

## 3. Detailed Table Dictionary

### 3.1 `User`
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY` | Global unique user identifier. |
| `email` | `VARCHAR(255)` | `UNIQUE, NOT NULL` | Login email address. |
| `phoneNumber` | `VARCHAR(32)` | `UNIQUE, NOT NULL` | E.164 phone number. |
| `passwordHash` | `VARCHAR(255)` | `NOT NULL` | Argon2id/Bcrypt password hash. |
| `role` | `UserRole` | `NOT NULL, DEFAULT 'STUDENT'` | Enum: `STUDENT`, `STALL_OWNER`, `ADMIN`, `STALL_STAFF`. |
| `isActive` | `BOOLEAN` | `DEFAULT true` | Account activation flag. |
| `createdAt` | `TIMESTAMPTZ`| `DEFAULT NOW()` | Record creation timestamp. |
| `updatedAt` | `TIMESTAMPTZ`| `NOT NULL` | Automatic update timestamp. |
| `deletedAt` | `TIMESTAMPTZ`| `NULLABLE` | Soft delete timestamp. |

### 3.2 `StudentProfile`, `StudentVerification` & `IdentityDocument` (Phase 4 Specification)
| Table | Column | Type | Description |
| :--- | :--- | :--- | :--- |
| `StudentProfile` | `id` | `UUID, PRIMARY KEY` | Unique profile record identifier. |
| `StudentProfile` | `userId` | `UUID, UNIQUE, FK` | Links directly to `User(id)` (1:1). |
| `StudentProfile` | `universityRegNumber` | `VARCHAR(64), UNIQUE` | University enrollment registration identifier. |
| `StudentProfile` | `accountStatus` | `StudentAccountStatus` | `PENDING_VERIFICATION`, `ACTIVE`, `SUSPENDED`, `REJECTED`. |
| `StudentVerification` | `id` | `UUID, PRIMARY KEY` | Unique verification application identifier. |
| `StudentVerification` | `studentProfileId` | `UUID, FK` | References `StudentProfile(id)`. |
| `StudentVerification` | `status` | `VerificationStatus` | `PENDING_SUBMISSION`, `UNDER_REVIEW`, `ACTIVE`, `REJECTED`, `SUSPENDED`. |
| `StudentVerification` | `rejectionReasonCode` | `VerificationRejectionReason` | Structured code: `INVALID_DOCUMENT`, `DOCUMENT_UNREADABLE`, `WRONG_DOCUMENT_TYPE`, `IDENTITY_MISMATCH`, `EXPIRED_DOCUMENT`, `INSUFFICIENT_INFORMATION`, `DUPLICATE_SUBMISSION`, `OTHER`. |
| `StudentVerification` | `submittedAt` | `TIMESTAMPTZ, NULLABLE` | Timestamp when document was submitted for review. |
| `StudentVerification` | `reviewedAt` | `TIMESTAMPTZ, NULLABLE` | Timestamp when admin completed adjudication. |
| `StudentVerification` | `reviewedByUserId` | `UUID, NULLABLE` | Admin reviewer user identifier. |
| `StudentVerification` | `reviewerNotes` | `TEXT, NULLABLE` | Optional internal administrative adjudication notes. |
| `IdentityDocument` | `id` | `UUID, PRIMARY KEY` | Unique document metadata identifier. |
| `IdentityDocument` | `verificationId` | `UUID, FK` | References `StudentVerification(id)`. |
| `IdentityDocument` | `documentType` | `IdentityDocType` | `STUDENT_ID_CARD`, `ENROLLMENT_LETTER`, `GOVERNMENT_ID`. |
| `IdentityDocument` | `fileStoragePath` | `VARCHAR(512)` | Private storage object key (UUIDv4.ext). |
| `IdentityDocument` | `originalFilename` | `VARCHAR(255), NULLABLE` | Sanitized original filename for display metadata. |
| `IdentityDocument` | `mimeType` | `VARCHAR(64)` | Verified MIME type: `application/pdf`, `image/jpeg`, `image/png`. |
| `IdentityDocument` | `fileSizeBytes` | `INT` | Enforced file size (maximum 5,242,880 bytes). |
| `IdentityDocument` | `fileSha256Checksum` | `CHAR(64)` | Cryptographic SHA-256 integrity checksum. |
| `IdentityDocument` | `isVerified` | `BOOLEAN, DEFAULT false` | Set true upon admin approval. |
| `LivenessVerification`| `providerName` | `VARCHAR(64)` | Provider identifier (e.g. `'mock'`, `'rekognition'`). |

> **Critical Data Architecture Rule**: Raw binary document bytes are **NEVER stored in PostgreSQL**. Only storage object references, cryptographic checksums, and sanitized metadata are persisted. Physical files reside in private storage accessed via temporary HMAC-signed URLs.

### 3.3 `MasterOrder` & `SubOrder`
| Table | Column | Type | Description |
| :--- | :--- | :--- | :--- |
| `MasterOrder` | `orderNumber` | `VARCHAR(32), UNIQUE` | Human-readable token: `ORD-YYYYMMDD-XXXX`. |
| `MasterOrder` | `totalAmount` | `DECIMAL(10, 2)` | Consolidated amount across all stalls. |
| `MasterOrder` | `advancePercentage` | `INT` | Enforced discrete value: 50, 60, 70, 80, 90, 100. |
| `MasterOrder` | `advanceAmount` | `DECIMAL(10, 2)` | Upfront amount paid at checkout. |
| `MasterOrder` | `remainingAmount`| `DECIMAL(10, 2)` | Balance due upon collection. |
| `SubOrder` | `subOrderNumber` | `VARCHAR(32), UNIQUE` | Stall-specific token: `SUB-YYYYMMDD-XXXX-S1`. |
| `SubOrder` | `stallId` | `UUID, FK` | Foreign key referencing `Stall(id)`. |
| `SubOrder` | `status` | `SubOrderStatus` | Independent finite state machine status. |
| `SubOrder` | `isBalancePaid` | `BOOLEAN` | True once remaining balance is settled. |
| `SubOrder` | `pickupGraceExpiresAt`| `TIMESTAMPTZ` | Timestamp after which order expires. |

### 3.4 `OrderItem` (Snapshots)
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID, PRIMARY KEY` | Order item identifier. |
| `subOrderId` | `UUID, FK` | References `SubOrder(id)`. |
| `menuItemId` | `UUID, FK, NULLABLE`| References historical `MenuItem(id)` (set null if item deleted). |
| `snapshotItemName`| `VARCHAR(255)` | Immutable copy of item name at time of order. |
| `snapshotPrice` | `DECIMAL(10, 2)` | Immutable unit price at time of order. |
| `snapshotPrepMinutes`| `INT` | Preparation duration captured at checkout. |
| `quantity` | `INT` | Order quantity (>= 1). |
| `totalPrice` | `DECIMAL(10, 2)` | `snapshotPrice * quantity`. |

### 3.5 `AuditLog` (Cryptographic Hash Chain)
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID, PRIMARY KEY` | Unique log entry identifier. |
| `sequenceNumber` | `BIGSERIAL, UNIQUE` | Strictly increasing monotonic sequence. |
| `actorId` | `UUID, FK, NULLABLE`| ID of the user or admin executing the action. |
| `actionType` | `AuditActionType` | Enum categorization of the event. |
| `targetEntity` | `VARCHAR(64)` | Target table/domain (e.g. `'Stall'`, `'Refund'`). |
| `targetId` | `VARCHAR(64)` | Target record primary key. |
| `previousValue` | `JSONB, NULLABLE` | Serialized state before mutation. |
| `newValue` | `JSONB, NULLABLE` | Serialized state after mutation. |
| `previousHash` | `CHAR(64)` | SHA-256 digest of record with `sequenceNumber - 1`. |
| `currentHash` | `CHAR(64), UNIQUE` | SHA-256 digest of `(previousHash + sequenceNumber + payload)`. |

### 3.6 `IdempotencyRecord`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID, PRIMARY KEY` | Unique record identifier. |
| `idempotencyKey` | `VARCHAR(128)` | Client/gateway-supplied idempotency key. |
| `scope` | `VARCHAR(64)` | Operation scope (e.g. `'CHECKOUT'`, `'PAYMENT_INITIATE'`). |
| `responsePayload`| `JSONB` | Cached response payload for replayed requests. |
| `statusCode` | `INT` | HTTP status code associated with response. |
| `lockedAt` | `TIMESTAMPTZ` | Timestamp when in-flight operation acquired key lock. |
| `expiresAt` | `TIMESTAMPTZ` | Expiry timestamp after which key can be purged (24-hour TTL). |

### 3.7 `Notification`
| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `UUID, PRIMARY KEY` | Unique notification identifier. |
| `recipientId` | `UUID, FK` | References `User(id)`. |
| `type` | `NotificationType` | Notification category enum. |
| `title` | `VARCHAR(255)` | Short headline for push/in-app alert. |
| `message` | `TEXT` | Full message content. |
| `metadata` | `JSONB, NULLABLE` | Associated order IDs, event types, or deep links. |
| `isRead` | `BOOLEAN` | Read tracking flag (defaults to `false`). |
| `createdAt` | `TIMESTAMPTZ` | Creation timestamp. |

---

## 4. Database Indexes Strategy

```sql
-- Fast lookup of active queue by stall for scheduling calculations
CREATE INDEX idx_suborder_stall_active ON "SubOrder" ("stallId", "status")
WHERE "status" IN ('PAYMENT_CONFIRMED', 'CONFIRMED', 'PREPARING');

-- Fast lookup for user order histories
CREATE INDEX idx_masterorder_student ON "MasterOrder" ("studentId", "createdAt" DESC);

-- Fast lookup for inventory locking and reservations
CREATE INDEX idx_menu_inventory ON "MenuItemInventory" ("menuItemId");

-- Fast lookup for audit trail verification
CREATE INDEX idx_audit_sequence ON "AuditLog" ("sequenceNumber" ASC);
```
