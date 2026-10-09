# CampusEats — REST API Specification

## 1. API Standards & Conventions

- **Architecture**: RESTful HTTP with JSON payloads.
- **Base URI**: `/api/v1`
- **Authentication**: `Authorization: Bearer <JWT_ACCESS_TOKEN>`
- **Idempotency**: `Idempotency-Key: <UUIDv4>` header mandatory on state-mutating requests (`POST`, `PUT`, `DELETE`).
- **Tracing**: `X-Request-ID: <UUIDv4>` attached to every request and response.
- **Validation**: Strict schema validation via Zod before application layer entry.

---

## 2. Standard Error Response Envelope

All API errors return a standardized JSON structure:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Advance payment percentage must be one of 50, 60, 70, 80, 90, 100",
    "details": [
      {
        "field": "advancePercentage",
        "issue": "Expected 50 | 60 | 70 | 80 | 90 | 100, received 45"
      }
    ],
    "timestamp": "2026-09-24T15:30:00.000Z",
    "requestId": "req-98234-a81f"
  }
}
```

---

## 3. Core Endpoint Catalog

### 3.1 Authentication & Profile (`/auth`)
| Method | Path | Auth | Roles | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/auth/register` | Public | Any | Register email, password, phone, role. |
| `POST` | `/auth/login` | Public | Any | Authenticate and obtain JWT token pair. |
| `POST` | `/auth/refresh` | Public | Any | Rotate refresh token and issue new access token. |
| `POST` | `/auth/logout` | Authenticated | Any | Revoke refresh token and invalidate session. |
| `GET` | `/auth/me` | Authenticated | Any | Retrieve authenticated user profile and permissions. |

### 3.2 Student Profile, Verification & Account Lifecycle (`/student`, `/admin`, `/storage`)
| Method | Path | Auth | Roles | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/student/profile` | Auth | `STUDENT` | Retrieve authenticated student's profile (BOLA/IDOR protected). |
| `GET` | `/student/verification/status` | Auth | `STUDENT` | Query current verification state and ordering eligibility flag. |
| `POST` | `/student/verification/document` | Auth | `STUDENT` | Submit identity document (PDF/JPEG/PNG, max 5MB, multipart/form-data only). |
| `GET` | `/student/verification/document/:id/url` | Auth | `STUDENT` | Obtain short-lived HMAC-signed temporary download URL for own document. |
| `GET` | `/admin/verifications` | Auth | `ADMIN` | List verification applications with status filtering and pagination. |
| `GET` | `/admin/verifications/:id/document/url` | Auth | `ADMIN` | Obtain temporary signed URL to review student document. |
| `POST` | `/admin/verifications/:id/approve` | Auth | `ADMIN` | Approve verification application and activate student account. |
| `POST` | `/admin/verifications/:id/reject` | Auth | `ADMIN` | Reject application with structured reason code and optional notes. |
| `POST` | `/admin/students/:id/suspend` | Auth | `ADMIN` | Administratively suspend student account (blocks ordering immediately). |
| `POST` | `/admin/students/:id/reactivate` | Auth | `ADMIN` | Reactivate suspended student account. |
| `GET` | `/storage/download/:token` | Auth | Any Valid Token | Download document using temporary HMAC-signed token (5-min TTL). |

### 3.3 Stall & Menu Operations (`/stalls`, `/menu`)
| Method | Path | Auth | Roles | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/stalls` | Public | Any | Browse approved stalls, live status, campus blocks. |
| `GET` | `/stalls/:id` | Public | Any | Fetch stall details, operating hours, capacity info. |
| `PATCH`| `/stalls/:id/status` | Auth | `OWNER` | Toggle live state (`OPEN`, `BUSY`, `TEMPORARILY_PAUSED`, `CLOSED`) within operating hours. |
| `PUT` | `/stalls/:id/operating-hours` | Auth | `ADMIN` | Configure official campus operating schedule (Admin only). |
| `PUT` | `/stalls/:id/capacity` | Auth | `OWNER` | Configure kitchen capacity and parallel prep limits. |
| `GET` | `/stalls/:id/menu` | Public | Any | Fetch active menu items, prices, allergens, stock. |
| `POST` | `/stalls/:id/menu` | Auth | `OWNER`, `STAFF` | Create new menu item (Requires `MANAGE_MENU`). |
| `PATCH`| `/menu/:itemId` | Auth | `OWNER`, `STAFF` | Update item price, prep time, or description (Requires `MANAGE_MENU`). |
| `PATCH`| `/menu/:itemId/availability` | Auth | `OWNER`, `STAFF` | Toggle availability or adjust inventory (Requires `MANAGE_INVENTORY`). |

### 3.4 Ordering & Pickup Scheduling (`/orders`, `/cart`)
| Method | Path | Auth | Roles | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/cart/validate` | Auth | `STUDENT` | Validate cart items, stock, and compute earliest pickup. |
| `POST` | `/orders/checkout` | Auth | `STUDENT` | Create `MasterOrder` and decomposed `SubOrder` records. |
| `GET` | `/orders/my-orders` | Auth | `STUDENT` | Retrieve authenticated student's active and historical orders. |
| `GET` | `/orders/stall/:stallId`| Auth | `OWNER`, `STAFF` | Retrieve live queue of sub-orders for owned/assigned stall. |
| `PATCH`| `/orders/suborder/:id/status` | Auth | `OWNER`, `STAFF` | Transition sub-order state (`CONFIRMED` -> `PREPARING` -> `READY`, or `REJECTED`). |
| `POST` | `/orders/suborder/:id/collect` | Auth | `OWNER`, `STAFF` | Confirm food handover after verifying student pass (STUDENTS CANNOT MUTATE). |
| `POST` | `/orders/suborder/:id/counter-settlement` | Auth | `OWNER`, `STAFF` | Record in-person cash/terminal balance payment (Requires `VIEW_PAYMENTS`). |

### 3.5 Payments & Refunds (`/payments`, `/webhooks`, `/refunds`)
| Method | Path | Auth | Roles | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/payments/initiate` | Auth | `STUDENT` | Generate UPI intent and dynamic QR for advance deposit. |
| `GET` | `/payments/:id/status`| Auth | `STUDENT` | Poll / check payment settlement status. |
| `POST` | `/payments/balance/online` | Auth | `STUDENT` | Settle remaining order balance via online UPI payment session. |
| `POST` | `/webhooks/payment` | Public (Signed) | Gateway | Ingest signed gateway webhook and confirm settlement. |
| `POST` | `/refunds/suborder/:id` | Auth | `ADMIN` | Execute administrative refund (Stall owners trigger refunds via order rejection). |

### 3.6 Realtime & Audit (`/realtime`, `/audit`)
| Method | Path | Auth | Roles | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/realtime/connect` | Auth | Any | Establish WebSocket / SSE connection for push updates. |
| `GET` | `/audit/logs` | Auth | `ADMIN` | Query cryptographically hash-chained audit trail. |
| `POST` | `/audit/verify-chain` | Auth | `ADMIN` | Execute full SHA-256 genesis-to-head integrity validation. |
