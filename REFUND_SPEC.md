# CampusEats — Refund Specification

## 1. Core Cancellation & Refund Principles

### 1.1 Strict Default Policy
Once an advance payment is confirmed and an order is accepted by the food stall:
**No voluntary cancellation or refund is permitted by the student.**

*Rationale*: Food stalls begin preparation and ingredient commitment based on confirmed orders. Allowing voluntary cancellation creates food wastage and counter disruption during peak rush hours.

### 1.2 Authorized Exception Conditions
Automatic or administrative refunds are initiated exclusively under the following strict conditions:
1. **Stall Rejection**: Stall owner or staff explicitly rejects an order (e.g., kitchen gas outage, kitchen overwhelmed in manual mode).
2. **Stall Sudden Closure**: Stall switches to `CLOSED` state due to an emergency while confirmed orders are pending.
3. **Item Stock Exhaustion**: An ingredient or dish runs out of stock after order confirmation, and the student declines to wait for replenishment.
4. **Administrative Intervention**: A platform `ADMIN` approves a refund due to a documented operational error or counter dispute.
5. **System / Infrastructure Failure**: Payment settlement occurred, but internal queue slot allocation failed irrecoverably.

---
 
 ## 2. Strict Refund Authorization Model
 
 > **CRITICAL SECURITY AND OPERATIONAL INVARIANT:**
 > **Stall Owners and Staff do NOT have unrestricted authority to issue refunds.**
 
 ### 2.1 Conceptual Flow
 A stall owner or staff cannot call an arbitrary refund endpoint to refund historical orders.
 Instead, operational failures trigger refund eligibility:
 
 ```text
 STALL OWNER / STAFF
      ↓
 Reject order / Report operational failure
      ↓
 SUB_ORDER → REJECTED / CANCELLED (REFUND ELIGIBILITY)
      ↓
 Automated Refund Service
      ↓
 Payment Provider (Gateway)
      ↓
 SUB_ORDER → REFUNDED
 ```
 
 ### 2.2 Authority Matrix
 - **Stall Owner / Staff**: Can reject an incoming sub-order during manual review or report an operational breakdown. This marks the sub-order `REJECTED`, making it **refund eligible**.
 - **Refund Service**: Automatically executes the refund via `PaymentProvider` based on verified sub-order state.
 - **Platform Admin**: Possesses direct administrative refund authority (`POST /api/v1/refunds/suborder/:id`) for exceptional disputes and operational corrections.
 - **Students**: Strictly barred from voluntarily cancelling accepted orders or requesting unvetted refunds.

In CampusEats, students frequently order from multiple stalls in a single transaction (e.g. Samosas from Stall A, Dosa from Stall B, and Chai from Stall C).

**Fault-Isolation Invariant:**
A failure, cancellation, or rejection at Stall A **NEVER** cancels or impacts Stall B or Stall C.

```
+─────────────────────────────────────────────────────────────+
|             MasterOrder: Total ₹180 (Advance ₹90)           |
+─────────────────────────────────────────────────────────────+
           │                                 │
           ▼                                 ▼
   SubOrder 1 (Stall A)              SubOrder 2 (Stall B)
   Subtotal: ₹100                    Subtotal: ₹80
   Advance Paid: ₹50                 Advance Paid: ₹40
           │                                 │
   [Stall Runs Out of Batter]                ▼
   Status: REJECTED                  Status: PREPARING
           │                                 │
           ▼                                 ▼
   Refund: ₹50                       Order Handed Over
   Status: REFUNDED                  Status: COLLECTED
```

---

## 3. Refund State Machine & Lifecycle

```
[ REJECTED / CANCELLED ]
           │
           ▼ (Trigger Refund Request)
  [ REFUND_PENDING ]
           │
           ├──► (Gateway Settlement Confirmed) ─► [ REFUNDED ]
           │
           └──► (Gateway Communication Failure) ─► [ FAILED ] (Retried by Admin / Cron)
```

### Transition Triggers
1. **Trigger**: When a `SubOrder` moves to `REJECTED` or `CANCELLED`, the system creates a `Refund` record in status `REFUND_PENDING`.
2. **Provider Call**: `PaymentProvider.processRefund()` is invoked asynchronously with an idempotency key.
3. **Completion**: When the payment provider confirms bank credit reversal via webhook, the status updates to `REFUNDED` and the student receives a push notification.

---

## 4. Refund Record Schema & Audit Fields

Every refund record strictly captures:
- `id`: Unique UUIDv4.
- `subOrderId`: Foreign key to the affected `SubOrder`.
- `idempotencyKey`: Unique deduplication key (`refund_<subOrderId>_<epoch>`).
- `amountPaidForSuborder`: Exact advance amount collected for this sub-order.
- `refundAmount`: Calculated refund amount (typically $100\%$ of `advancePaidAmount`).
- `refundReason`: Human-readable categorization string (e.g. `STALL_REJECTION`, `ITEM_OUT_OF_STOCK`, `ADMIN_OVERRIDE`).
- `refundReference`: External bank/gateway ARN (Acquirer Reference Number).
- `refundStatus`: `REFUND_PENDING`, `REFUNDED`, `FAILED`.
- `initiatedAt`: Timestamp when refund was queued.
- `completedAt`: Timestamp when bank reversal confirmed.

---

## 5. Uncollected Order Policy (Zero Refund)

If a student fails to collect their order within the configured pickup grace period:
- The sub-order transitions from `READY` $\longrightarrow$ `EXPIRED`.
- **No refund is generated.**
- The advance paid is retained by the stall to offset wasted food preparation costs.
- The platform audit log records the expiration event.
