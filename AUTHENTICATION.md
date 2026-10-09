# CampusEats — Authentication & Session Lifecycle Architecture

## 1. Overview & Signing Model

CampusEats implements **HMAC-signed JWT Bearer tokens** for stateless short-lived request authorization, combined with a **stateful PostgreSQL `RefreshSession` model** for long-lived session management, cryptographic token rotation, and instant server-side revocation.

> **Signing Terminology**: Tokens are signed symmetrically using HMAC-SHA256 (`HS256`) with secret keys (`JWT_SECRET` for access tokens and `JWT_REFRESH_SECRET` for refresh tokens). Asymmetric algorithms (such as RSA or ECDSA) are not used. Misleading descriptions such as "asymmetric-style JWT" have been strictly removed across all system specifications.

---

## 2. Token Lifetimes & Properties

| Token Type | Lifetime | Transport / Presentation | Contents / Claims | Security Controls |
| :--- | :--- | :--- | :--- | :--- |
| **Access Token** | **15 minutes** | `Authorization: Bearer <token>` header | `userId`, `role`, `email`, `iat`, `exp` | Short lifetime limits exposure window if intercepted. Signed with `JWT_SECRET` (min. 32 chars). |
| **Refresh Token** | **7 days** | Request body `{ refreshToken }` or HTTP-only cookie | `userId`, `jti` (unique UUID), `iat`, `exp` | Never stored in plaintext anywhere. Signed with `JWT_REFRESH_SECRET`. Linked to single-use session in PostgreSQL. |

---

## 3. Server-Side Refresh Session Model

Refresh tokens are tracked in PostgreSQL using the `RefreshSession` table. Under no circumstances are plaintext refresh tokens stored in the database.

### 3.1 Database Schema (`refresh_sessions`)

```prisma
model RefreshSession {
  id                  String    @id @default(uuid())
  userId              String
  tokenHash           String    @unique  // SHA-256 deterministic hex digest
  familyId            String    @default(uuid())
  expiresAt           DateTime
  createdAt           DateTime  @default(now())
  revokedAt           DateTime?
  replacedBySessionId String?
  userAgent           String?
  ipAddress           String?

  user                User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([tokenHash])
  @@index([familyId])
}
```

### 3.2 SHA-256 Token Fingerprinting
When a refresh token is issued:
1. `TokenService.generateTokens(...)` assigns a cryptographically unique `jti: crypto.randomUUID()` in the refresh token payload.
2. `TokenService.hashToken(token)` calculates `crypto.createHash('sha256').update(token).digest('hex')`.
3. Only this 64-character hexadecimal fingerprint is persisted to `refresh_sessions.token_hash`.
4. Even in the event of an unauthorized database dump, attacker cannot forge or use the hashes as refresh tokens.

---

## 4. Token Rotation & Replay Defense

CampusEats enforces **strict single-use token rotation** on every refresh operation:

```text
CLIENT                           API GATEWAY / AUTH SERVICE                       POSTGRESQL
  │                                           │                                        │
  │── POST /api/v1/auth/refresh ─────────────>│                                        │
  │   { refreshToken: Token A }               │── Hash Token A (SHA-256) ─────────────>│
  │                                           │<── Return Session A ───────────────────│
  │                                           │                                        │
  │                                           │── Verify Expiry & Revocation ──────────│
  │                                           │── Verify User Active & Not Deleted ────│
  │                                           │                                        │
  │                                           │── Atomic Transaction: ────────────────>│
  │                                           │   1. Revoke Session A                  │
  │                                           │   2. Link replacedBySessionId = B      │
  │                                           │   3. Insert Session B (same familyId)  │
  │                                           │                                        │
  │<── 200 OK ────────────────────────────────│                                        │
  │   { tokens: { accessToken, Token B } }    │                                        │
```

### 4.1 Replay Attack Detection Protocol
If an already-rotated or revoked refresh token (e.g., Token A) is presented again:
1. Lookup finds `session.revokedAt !== null` or `session.replacedBySessionId !== null`.
2. This is treated as a **potential token theft / replay breach**.
3. The auth service immediately revokes **the entire token family**:
   ```sql
   UPDATE refresh_sessions SET revoked_at = NOW() WHERE family_id = :familyId AND revoked_at IS NULL;
   ```
4. A security audit log is immediately written:
   - `actionType: AUTH_REPLAY_DETECTED`
   - `reason: 'Attempted reuse of already-rotated refresh token'`
   - Plaintext tokens, hashes, and passwords are never included in audit metadata.
5. The request is rejected with `401 Unauthorized`. Any subsequent request with Token B in that family also fails.

---

## 5. Server-Side Logout

Stateless client-side token disposal is insufficient for university financial security. 

`POST /api/v1/auth/logout`:
1. Authenticated via `Authorization: Bearer <token>` or accepts `{ refreshToken }` in body.
2. Locates the active session or session family in PostgreSQL.
3. Sets `revokedAt = new Date()`, immediately rendering all refresh tokens in that family invalid.
4. An audit event `AUTH_LOGOUT` is appended to the SHA-256 hash-chained audit log.
5. Existing 15-minute access tokens expire naturally at their short expiry window; all stateful authority checks (roles, permissions, account status) immediately block user actions if deactivated.

---

## 6. Database-Authoritative Authorization

While JWT access tokens include `userId`, `role`, and `email` as convenience claims, **authorization decisions never rely solely on stale claims inside the token**.

### 6.1 Real-Time Enforcement Architecture
On every protected endpoint, `requireAuth` middleware:
1. Cryptographically verifies the HMAC signature of the Bearer access token.
2. Queries the PostgreSQL database for the current user record:
   ```typescript
   const user = await prisma.user.findUnique({
     where: { id: payload.userId },
     include: {
       studentProfile: true,
       staffAccount: { include: { permissions: true } },
       ownedStalls: { select: { id: true } },
     },
   });
   ```
3. Checks `user.isActive` and `user.deletedAt`. Deactivated or soft-deleted users are rejected with `401 Unauthorized`.
4. Populates `req.user` with the **live database role, permissions, and owned stall IDs**.

### 6.2 Privilege Downgrade Example
- If an admin changes a `STALL_OWNER` user to `STUDENT` in PostgreSQL:
- An existing unexpired access token containing `role: 'STALL_OWNER'` is immediately rejected by `requireRole(UserRole.STALL_OWNER)` with `403 Forbidden`.
- If a staff member has `MANAGE_ORDERS` revoked in PostgreSQL:
- On the next request, `req.user.staffAccount.permissions` reflects the removal, and access is denied with `403 Forbidden`.

---

## 7. Transport Security & Threat Model

| Transport Channel | Configuration | Threat Mitigations |
| :--- | :--- | :--- |
| **HTTP Authorization Header** | `Authorization: Bearer <accessToken>` | Prevents CSRF attacks; access tokens are short-lived (15 minutes). |
| **HTTP-Only Cookies (When Browser Client Enabled)** | `HttpOnly`, `Secure` (in prod), `SameSite=Strict`, `Path=/api/v1/auth` | Protects long-lived refresh tokens against Cross-Site Scripting (XSS) extraction. Plain tokens never placed in insecure `localStorage`. |
| **Transport Encryption** | TLS 1.3 / HTTPS | Mitigates man-in-the-middle (MITM) credential interception. |

---

## 8. Summary of Auth Endpoints

| Method | Endpoint | Auth Required | Rate Limited | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | None | Yes (5 req/15m) | Registers new student account with `PENDING_VERIFICATION`. |
| `POST` | `/api/v1/auth/login` | None | Yes (5 req/15m) | Verifies credentials, creates `RefreshSession`, returns token pair. |
| `POST` | `/api/v1/auth/refresh` | None (Refresh token in body) | Yes (5 req/15m) | Rotates refresh session, returns new access and refresh tokens. |
| `POST` | `/api/v1/auth/logout` | Optional Bearer or body token | No | Server-side revocation of session family in PostgreSQL. |
| `GET` | `/api/v1/auth/me` | Bearer Token | No | Returns authenticated user profile resolved from PostgreSQL. |
