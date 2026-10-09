# ADR-008: Idempotency Keys and Concurrency Control

## Status
Accepted

## Context
During campus rush hours, students experiencing poor mobile connectivity frequently double-tap checkout or payment confirmation buttons. Simultaneously, payment aggregators deliver duplicate webhook retries, and high concurrency on scarce items can result in overselling or double bookings of kitchen time slots.

## Decision
1. **Idempotency Header**: All state-mutating requests (`/orders/checkout`, `/payments/initiate`, `/refunds/suborder/:id`) require an `Idempotency-Key` header (UUIDv4).
2. **Idempotency Persistence**: The `IdempotencyRecord` table caches request hashes, execution statuses, and response payloads for 24 hours. Duplicate requests return the stored canonical result immediately.
3. **Database Concurrency Control**:
   - Stock depletions and kitchen window allocations execute within atomic database transactions with row-level locks (`SELECT ... FOR UPDATE`).
   - Webhook processing uses unique database constraints on `(provider, providerTransactionId)` to prevent duplicate settlement.

## Consequences
### Positive
- Zero duplicate orders or duplicate bank charges caused by network retries.
- Webhook replays are safely handled with idempotent `200 OK` returns.
- Guaranteed stock count integrity under high concurrent checkout pressure.

### Negative
- Clients must generate and manage unique UUIDv4 idempotency keys.
- Requires maintenance and cleanup of expired idempotency records.
