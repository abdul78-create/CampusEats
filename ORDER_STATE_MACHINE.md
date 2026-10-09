# CampusEats — Order State Machine Specification

## 1. Architectural Philosophy

In CampusEats, an order is divided into two distinct levels:
1. **`MasterOrder` State Machine**: Tracks the overall payment collection and multi-stall aggregation state.
2. **`SubOrder` State Machine**: Governs the operational kitchen lifecycle for each specific stall.

**Strict Centralized Rule:**
State transitions are executed **only** via domain services with explicit authorization. The client/frontend can never force or bypass a transition.

---

## 2. SubOrder State Machine Lifecycle

### 2.1 State Definitions

| State | Category | Description |
| :--- | :--- | :--- |
| `PENDING_PAYMENT` | Initial | SubOrder created in database; waiting for advance UPI payment verification. |
| `PAYMENT_CONFIRMED` | Operational | Advance payment verified by webhook. Ready for stall acceptance review. |
| `CONFIRMED` | Operational | Stall accepted the order (manual review or automatic strategy). Kitchen queue reserved. |
| `PREPARING` | Operational | Stall kitchen began cooking / assembly of items. |
| `READY` | Operational | Food cooked, packed, and placed in pickup bay. Notification sent to student. |
| `COLLECTED` | Terminal (Success) | Student showed credentials, settled remaining balance, and collected food. |
| `PAYMENT_FAILED` | Terminal (Exception)| Advance payment failed or expired. Order discarded without kitchen commitment. |
| `REJECTED` | Terminal (Exception)| Stall rejected order (e.g., kitchen out of gas, unexpected closure). Isolated refund initiated. |
| `CANCELLED` | Terminal (Exception)| Cancelled due to operational exception / admin override. Isolated refund initiated. |
| `REFUND_PENDING` | Intermediate | Refund request registered with payment provider; awaiting settlement. |
| `REFUNDED` | Terminal (Financial)| Bank settlement confirmed for the advance amount paid. |
| `EXPIRED` | Terminal (Failure) | Student failed to collect order before grace period elapsed. No refund issued. |
| `MISSED_PICKUP` | Terminal (Failure) | Counter closed at end of day with unclaimed food. No refund issued. |

---

## 3. Allowed Transition Matrix (SubOrder)

| Current State | Allowed Next States | Trigger / Actor | Side Effects |
| :--- | :--- | :--- | :--- |
| `PENDING_PAYMENT` | `PAYMENT_CONFIRMED` | Payment Webhook / System | Allocate inventory reservation, notify stall. |
| `PENDING_PAYMENT` | `PAYMENT_FAILED` | Payment Timeout / System | Release reserved items. |
| `PAYMENT_CONFIRMED` | `CONFIRMED` | Stall Owner / Staff / AutoStrategy | Reserve kitchen queue slot, calculate pickup. |
| `PAYMENT_CONFIRMED` | `REJECTED` | Stall Owner / Staff | Release inventory, initiate isolated refund. |
| `CONFIRMED` | `PREPARING` | Stall Owner / Staff | Emit `SUB_ORDER_STATUS_CHANGED`. |
| `CONFIRMED` | `CANCELLED` | Admin Override | Release queue slot, initiate isolated refund. |
| `PREPARING` | `READY` | Stall Owner / Staff | Set `pickupGraceExpiresAt`, notify student. |
| `READY` | `COLLECTED` | Stall Owner / Staff | Settle balance, close order, record audit log. |
| `READY` | `EXPIRED` | Scheduled Expiry Cron | Release pickup bay, emit notification. No refund. |
| `REJECTED` | `REFUND_PENDING` | Automated Refund Trigger | Dispatch to `PaymentProvider.processRefund`. |
| `CANCELLED` | `REFUND_PENDING` | Automated Refund Trigger | Dispatch to `PaymentProvider.processRefund`. |
| `REFUND_PENDING` | `REFUNDED` | Payment Provider Webhook | Mark refund resolved, notify student. |
| `READY` | `MISSED_PICKUP` | End of Day Stall Closure | Mark order archived. No refund. |

---

## 4. Strictly Forbidden Transitions

The domain service rejects with `InvalidStateTransitionException`:

```
❌ COLLECTED       ──►  PREPARING
❌ CANCELLED       ──►  CONFIRMED
❌ EXPIRED         ──►  PREPARING
❌ REFUNDED        ──►  PREPARING
❌ PAYMENT_FAILED  ──►  CONFIRMED
❌ REJECTED        ──►  READY
❌ COLLECTED       ──►  REFUND_PENDING (No post-pickup student refunds)
```

---

## 5. MasterOrder State Machine

The parent `MasterOrder` aggregates sub-orders:

```
[ PENDING_PAYMENT ]
        │
        ├─► (Payment Fails) ──────► [ CANCELLED ]
        │
        ▼ (Advance Confirmed)
[ PAYMENT_CONFIRMED ]
        │
        ├──► (All sub-orders succeed) ──────────► [ COMPLETED ]
        ├──► (Some sub-orders succeed, some fail) ► [ PARTIALLY_FULFILLED ]
        └──► (All sub-orders rejected/refunded) ──► [ REFUNDED ]
```

---

## 6. Implementation Architecture

State transitions are modeled using a strict state graph:

```typescript
export const SUB_ORDER_TRANSITIONS: Record<SubOrderStatus, SubOrderStatus[]> = {
  [SubOrderStatus.PENDING_PAYMENT]: [
    SubOrderStatus.PAYMENT_CONFIRMED,
    SubOrderStatus.PAYMENT_FAILED,
  ],
  [SubOrderStatus.PAYMENT_CONFIRMED]: [
    SubOrderStatus.CONFIRMED,
    SubOrderStatus.REJECTED,
  ],
  [SubOrderStatus.CONFIRMED]: [
    SubOrderStatus.PREPARING,
    SubOrderStatus.CANCELLED,
  ],
  [SubOrderStatus.PREPARING]: [
    SubOrderStatus.READY,
  ],
  [SubOrderStatus.READY]: [
    SubOrderStatus.COLLECTED,
    SubOrderStatus.EXPIRED,
    SubOrderStatus.MISSED_PICKUP,
  ],
  [SubOrderStatus.REJECTED]: [
    SubOrderStatus.REFUND_PENDING,
  ],
  [SubOrderStatus.CANCELLED]: [
    SubOrderStatus.REFUND_PENDING,
  ],
  [SubOrderStatus.REFUND_PENDING]: [
    SubOrderStatus.REFUNDED,
  ],
  [SubOrderStatus.PAYMENT_FAILED]: [],
  [SubOrderStatus.REFUNDED]: [],
  [SubOrderStatus.COLLECTED]: [],
  [SubOrderStatus.EXPIRED]: [],
  [SubOrderStatus.MISSED_PICKUP]: [],
};
```
