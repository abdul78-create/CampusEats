# CampusEats — Security Architecture & Hardening Specification

## 1. Threat Model & Risk Vectors

| Risk Vector | Threat Analysis | Mitigation in CampusEats |
| :--- | :--- | :--- |
| **Ghost Ordering / Spam** | Malicious users placing large orders without intending to pay, exhausting stall stock. | Mandatory 50% minimum advance payment via verified UPI before order transmission to kitchens. |
| **Impersonation at Pickup** | Unauthorized students claiming another student's food at the pickup counter. | Verified profile photos and masked registration numbers checked at handover. |
| **Race Conditions in Slots** | Multiple students booking the same kitchen slot simultaneously, overloading stalls. | Atomic database transactions and row-level locks on inventory and kitchen window quotas. |
| **Double-Spend & Replay** | Replayed checkout requests or replayed payment callbacks. | Unique `Idempotency-Key` headers on all mutations and unique constraints on provider transaction IDs. |
| **PII Data Leakage** | Food stall workers scraping student personal phone numbers or ID cards. | Strict data minimization. Stall staff UI masks phone numbers and completely hides ID cards. |
| **Audit Log Tampering** | Rogue admins modifying financial records or altering capacity overrides. | SHA-256 cryptographically hash-chained audit log with genesis verification. |

---

## 2. Authentication & Session Strategy

1. **Password Hashing**: Bcrypt with minimum 12 salt rounds. Plaintext passwords never touch logs or databases.
2. **Access Tokens**: Short-lived HMAC-signed JWT Bearer tokens (15-minute expiration) signed symmetrically with HMAC-SHA256 (`HS256`) via `JWT_SECRET`.
3. **Refresh Tokens**: 7-day expiration with unique cryptographic `jti`. Stored in PostgreSQL strictly as deterministic SHA-256 fingerprints in the `RefreshSession` model—plaintext refresh tokens are NEVER persisted.
4. **Single-Use Rotation & Replay Defense**: Each refresh cycle atomically rotates the refresh token and session. Replay of an already-rotated or revoked token immediately revokes the entire token family and records an `AUTH_REPLAY_DETECTED` audit event.
5. **Server-Side Logout**: `POST /api/v1/auth/logout` sets `revokedAt` on the session family in PostgreSQL, immediately invalidating old refresh tokens.
6. **Database-Authoritative Authorization**: Token role claims are convenience metadata only. Real-time authorization middleware queries PostgreSQL on every request to verify live account status (`isActive`, `deletedAt`), current role, assigned staff permissions, and owned stall IDs.

---

## 3. Server-Side Authorization: Role + Permission + Resource Scope (BOLA & IDOR Defense)

CampusEats strictly rejects authorization models that check only `User.role`.
Every resource mutation and read enforces a 3-tier authorization model:

$$\text{User} \longrightarrow \text{Role} \longrightarrow \text{Permission} \longrightarrow \text{Resource Scope (Ownership)}$$

### 3.1 Resource Scope Rules
1. **Student Isolation (IDOR Defense)**:
   - Students can access only their own orders (`studentId === session.userId`), own profile, and own verification documents.
   - Any query attempting to access or mutate another student's record throws an explicit `ForbiddenError` (IDOR violation).
2. **Stall Tenant Isolation (BOLA Defense)**:
   - A Stall Owner can only inspect and manage stalls they own (`session.ownedStallIds.includes(stallId)`).
   - An owner of Stall A cannot access orders, menus, or inventory of Stall B.
   - Staff members are bound to their assigned `staffStallId` and checked against delegated permissions (`MANAGE_ORDERS`, `MANAGE_MENU`, `VIEW_PAYMENTS`, `VIEW_ANALYTICS`, `MANAGE_INVENTORY`).
3. **Pickup Collection Gate**:
   - `STUDENT` accounts are **strictly prohibited from mutating an order to `COLLECTED`**.
   - Handover requires verification by stall owner or staff with `MANAGE_ORDERS`.
4. **Counter Payment Gate**:
   - Students can never self-declare that cash was paid.
   - Counter cash/terminal settlements require an authorized stall employee with `VIEW_PAYMENTS`.
5. **Refund Execution Gate**:
   - Direct administrative refunds are restricted to `ADMIN`. Stall owners trigger refund eligibility by rejecting orders or reporting failures.

### 3.2 Ordering Eligibility: The 4-Pillar Database-Authoritative Gate
CampusEats strictly decouples authentication state, verification state, and account lifecycle state.
A student is eligible to checkout orders if and only if all four database-authoritative conditions are satisfied:
1. `User.isActive === true` (Account is active, not deactivated or soft-deleted)
2. `User.role === 'STUDENT'` (User has legitimate student role)
3. `StudentProfile.accountStatus === 'ACTIVE'` (Student lifecycle account status is active, not `SUSPENDED`, `REJECTED`, or `PENDING_VERIFICATION`)
4. `StudentVerification.status === 'ACTIVE'` (Student has completed identity document verification and received administrative approval)

$$\text{User.isActive} \land (\text{User.role} = \text{STUDENT}) \land (\text{Profile.accountStatus} = \text{ACTIVE}) \land (\text{Verification.status} = \text{ACTIVE}) \iff \text{Can Checkout}$$

Any attempt to bypass this check (e.g. unverified student or suspended student presenting a valid JWT) results in an immediate HTTP 403 `STUDENT_VERIFICATION_REQUIRED` or `ACCOUNT_NOT_ELIGIBLE_FOR_ORDERING` domain error.

---

## 4. Sensitive Data Masking Standard

Before any JSON payload leaves the API gateway, sensitive identifiers are sanitized:

```typescript
export class MaskingUtil {
  static maskRegistration(reg: string): string {
    if (!reg || reg.length <= 4) return '••••';
    const visibleLength = 4;
    const prefix = reg.slice(0, 4);
    const suffix = reg.slice(-visibleLength);
    return `${prefix}••••${suffix}`;
  }

  static maskPhoneNumber(phone: string): string {
    if (!phone || phone.length <= 4) return '••••••••••';
    const lastFour = phone.slice(-4);
    return `+91 ••••• ${lastFour}`;
  }

  static maskUpi(vpa: string): string {
    const [user, domain] = vpa.split('@');
    if (!user || !domain) return '••••@upi';
    const maskedUser = user.slice(0, 2) + '•••';
    return `${maskedUser}@${domain}`;
  }
}
```

---

## 5. Identity Document & File Upload Security Standards

Uploads for student ID cards and identity documents are subjected to multi-layered defensive verification:

1. **Authoritative Magic Bytes Inspection**:
   - PDF: Must start with `%PDF` (`\x25\x50\x44\x46`).
   - JPEG: Must start with `\xFF\xD8\xFF`.
   - PNG: Must start with `\x89\x50\x4E\x47\x0D\x0A\x1A\x0A`.
   - Client-provided MIME types or file extensions are completely distrusted.
2. **Malicious Signature & Active Code Defense**:
   - Rejection of Windows MZ executable binaries (`\x4D\x5A`).
   - Rejection of Linux ELF executable binaries (`\x7F\x45\x4C\x46`).
   - Rejection of ZIP/Office archives (`\x50\x4B\x03\x04`).
   - Rejection of embedded script/HTML payloads (`<script`, `<?php`, `<html`, `onload=`).
3. **File Size Enforcement**:
   - Strict maximum threshold of 5,242,880 bytes (5MB). Empty files (0 bytes) rejected immediately.
4. **Filename Sanitization & Path Traversal Neutralization**:
   - User-supplied filenames are stripped of path separators (`/`, `\`), traversal sequences (`../`, `..\\`), control characters, and non-alphanumeric symbols.
   - Storage objects are stored using server-generated UUID identifiers (`UUIDv4.ext`). User-supplied filenames never serve as storage paths.
5. **Zero Raw Bytes in PostgreSQL**:
   - Relational database stores strictly metadata, storage object paths, and SHA-256 checksums. Binary contents are never stored in SQL tables.
6. **Temporary Signed URLs with HMAC-SHA256 Expiration**:
   - Files are stored in private storage outside the web root (`./storage/uploads`).
   - Document URLs are HMAC-SHA256 signed with a strict 5-minute expiration (`exp`) and signature (`sig`).
   - Expired, forged, or altered signatures are rejected with HTTP 403 Forbidden.
7. **Strict Authorization Boundaries (BOLA/IDOR)**:
   - Students can only generate download URLs for their own identity documents.
   - Stall Owners and Stall Staff have zero access to student documents or verification queues (403 Forbidden).
   - Platform Admins can access documents for review purposes with all access actions logged to the cryptographic audit trail.

---

## 6. HTTP Hardening & Network Security

1. **Helmet Middleware**: Configures HTTP headers (`Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`).
2. **Rate Limiting**: Express rate limiter enforcing 100 requests per 15 minutes per IP on general endpoints, and 5 requests per 15 minutes on `/auth/login` and `/auth/register`.
3. **CORS Restrictions**: Whitelisted origins only (development: `http://localhost:3000`, production: configured campus domain).
4. **Environment Isolation**: `.env` and production secrets are injected via container orchestration, never committed to source repositories.
