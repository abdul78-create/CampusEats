# ADR-003: Partial Advance Payment (50%-100%) and Fault-Isolated Refunds

## Status
Accepted

## Context
During campus peak periods, food stalls face ghost orders and walkouts if cash on delivery (0% advance) is permitted. Conversely, requiring 100% upfront payment can be restrictive for students who have limited cash liquidity or prefer to pay the balance after inspecting food freshness at counter pickup.

Furthermore, when an item becomes unavailable in a multi-stall checkout, students should not lose their entire order, nor should refunds be complex.

## Decision
1. **Mandatory Advance Payment Range**: We enforce a minimum 50% advance payment at checkout, choosing from discrete tiers: $\{50\%, 60\%, 70\%, 80\%, 90\%, 100\%\}$. $0\%$ advance is strictly forbidden.
2. **Proportional Sub-Order Allocation**: Advance payments are allocated across sub-orders proportionally to their item subtotal.
3. **Fault-Isolated Refunds**: When a sub-order is rejected, unexpectedly closed, or cancelled for operational reasons, a refund is issued exclusively for that sub-order's advance paid portion. The other sub-orders proceed normally.
4. **No Voluntary Cancellations**: Confirmed orders cannot be voluntarily cancelled or refunded by students once accepted by stalls.

## Consequences
### Positive
- Guarantees kitchen commitment and eliminates ghost orders.
- Provides students payment flexibility (50%-100%).
- Protects other stalls in a cart from being cancelled due to a single stall failure.

### Negative
- Stall counters must handle remaining balance collection (online or cash/POS) before marking an order as `COLLECTED`.
