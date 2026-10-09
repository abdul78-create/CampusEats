# ADR-002: Two-Tier Order and Sub-Order State Machine

## Status
Accepted

## Context
Students on campus frequently assemble meals across multiple distinct stalls within a single checkout (e.g. Dosa from Stall A, Samosa from Stall B, Chai from Stall C). 

If an order is modeled as a single monolithic entity, operational events at one stall (such as Stall A running out of batter and rejecting the order) would either catastrophically cancel the entire student order or require complex ad-hoc state patching.

## Decision
We decouple ordering into a two-tier finite state machine:
1. **`MasterOrder`**: Represents the customer's financial cart, total invoice, customer identity, and payment session status (`PENDING_PAYMENT`, `PAYMENT_CONFIRMED`, `PARTIALLY_FULFILLED`, `COMPLETED`, `CANCELLED`, `REFUNDED`).
2. **`SubOrder`**: Represents the kitchen work assigned to exactly one stall. Possesses an independent lifecycle (`PENDING_PAYMENT`, `PAYMENT_CONFIRMED`, `CONFIRMED`, `PREPARING`, `READY`, `COLLECTED`, `REJECTED`, `CANCELLED`, `REFUND_PENDING`, `REFUNDED`, `EXPIRED`, `MISSED_PICKUP`).

Sub-order state transitions are enforced strictly through domain state validation matrices. Invalid transitions (e.g., `COLLECTED` $\rightarrow$ `PREPARING`) throw explicit domain errors.

## Consequences
### Positive
- Rejection or cancellation of SubOrder A never aborts or impairs SubOrder B or C.
- Kitchen terminals only see their own stall's sub-orders and transition them independently.
- Financial auditability is clear: each sub-order carries its own portion of the advance payment and its own refund record if failed.

### Negative
- Slightly higher database record count (1 MasterOrder + N SubOrders).
- MasterOrder aggregate must listen to sub-order completion events to update its composite status.
