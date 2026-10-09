# CampusEats — Payment Specification

## 1. Core Principles & Philosophy

Pre-ordering university food during high-congestion periods requires financial commitment from students to prevent malicious ghost orders, while providing students flexibility during campus breaks.

### Foundational Constraints
1. **Mandatory Partial Advance Payment**: A minimum of 50% must be paid before an order is dispatched to stall kitchens.
2. **Discrete Percentage Tiering**: Only discrete advance percentages are permitted:
   $$\text{Allowed Percentages} = \{50\%, 60\%, 70\%, 80\%, 90\%, 100\%\}$$
3. **No 0% Allowed**: Zero advance payments are unconditionally invalid.
4. **Primary Rail**: Unified Payments Interface (UPI) supporting Google Pay, PhonePe, Paytm, BHIM, and generic UPI apps.
5. **No Local Settlement Assumptions**: A client-generated transaction ID or local device status is never accepted as proof of settlement. Only server-side verified cryptographically signed webhooks confirm funds.

---

## 2. Mathematical Breakdown

For a `MasterOrder` with total amount $T$ (the sum of all item snapshots in the cart) and selected advance percentage $P \in \{50, 60, 70, 80, 90, 100\}$:

$$\text{Advance Amount } (A) = \text{round}\left(T \times \frac{P}{100}, 2\right)$$
$$\text{Remaining Balance } (B) = T - A$$

### Sub-Order Allocation
When a multi-stall checkout occurs with sub-orders $S_1, S_2, \dots, S_n$:
For each sub-order $i$ with subtotal $T_i$:
$$A_i = \text{round}\left(T_i \times \frac{P}{100}, 2\right)$$
$$B_i = T_i - A_i$$

Any penny rounding discrepancy $(\sum A_i \neq A)$ is deterministically resolved on the largest sub-order to maintain penny-perfect consistency.

---

## 3. End-to-End UPI Payment Flow

```
[Student Client]         [CampusEats Server]         [PaymentProvider]         [UPI App / Bank]
      │                           │                          │                         │
      │ 1. POST /payments/initiate│                          │                         │
      │    (masterOrderId, P%)    │                          │                         │
      │──────────────────────────►│                          │                         │
      │                           │ 2. Create Payment        │                         │
      │                           │    Record (INITIATED)    │                         │
      │                           │ 3. Call Provider         │                         │
      │                           │─────────────────────────►│                         │
      │                           │                          │ 4. Generate UPI Intent  │
      │                           │ 5. Return Intent & QR    │    / Dynamic QR Payload │
      │ 6. Render UPI Intent / QR │◄─────────────────────────│                         │
      │◄──────────────────────────│                          │                         │
      │                           │                          │                         │
      │ 7. Student authorizes transaction via GPay / PhonePe / Paytm                   │
      │───────────────────────────────────────────────────────────────────────────────►│
      │                           │                          │                         │
      │                           │                          │ 8. Bank confirms funds  │
      │                           │                          │◄────────────────────────│
      │                           │ 9. POST /webhooks/payment│                         │
      │                           │    (Signed Webhook Payload)                        │
      │                           │◄─────────────────────────│                         │
      │                           │ 10. Verify HMAC Signature│                         │
      │                           │ 11. Idempotency Check    │                         │
      │                           │ 12. Move Payment ->      │                         │
      │                           │     SUCCESS              │                         │
      │                           │ 13. SubOrders ->         │                         │
      │                           │     PAYMENT_CONFIRMED    │                         │
      │ 14. Realtime Push:        │                          │                         │
      │     PAYMENT_VERIFIED      │                          │                         │
      │◄──────────────────────────│                          │                         │
```

---

## 4. Idempotency & Concurrency Safeguards

1. **Checkout Idempotency**:
   - Every checkout submission must include an `Idempotency-Key` header (UUIDv4).
   - If a student taps checkout twice, the second request detects the existing key and returns the identical `MasterOrder` without duplicating orders or charging twice.
2. **Webhook Replay Protection**:
   - Webhooks store the provider transaction ID in `PaymentTransaction` with a `UNIQUE` constraint.
   - Replayed callbacks from payment aggregators return an immediate `200 OK` without re-executing state transitions.
3. **Double-Spend Prevention**:
   - Orders cannot initiate a second payment session if an active session is already `SUCCESS` or currently locked in verification.

---

## 5. Settlement of Remaining Balance
 
 For orders where $P < 100\%$:
 - The student owes remaining balance $B$ upon arrival at the stall.
 
- Two mutually exclusive, authenticated flows govern balance settlement:
-
-### 5.1 Online Balance Payment
-```text
-Student
-  ↓
-POST /payments/balance/online
-  ↓
-PaymentProvider (UPI Intent / QR)
-  ↓
-Authoritative Gateway Webhook
-  ↓
-SubOrder.isBalancePaid = true
-```
-
-### 5.2 Counter Payment (In-Person Handover)
-```text
-Student arrives at stall
-  ↓
-Authorized Staff / Owner inspects Order & Balance Due on terminal
-  ↓
-Student hands cash or pays counter QR
-  ↓
-Staff invokes POST /orders/suborder/:id/counter-settlement
-  (Requires staff permission VIEW_PAYMENTS)
-  ↓
-SubOrder.isBalancePaid = true + Audit Log Entry created
-```
-
-> **SECURITY INVARIANT: ZERO SELF-DECLARATION**
-> A student can **never** submit a claim such as *"I paid cash"* to the server. Only an authenticated stall owner or authorized staff member can mark counter payment settled.
-
-## 6. Payment Terminology & Settlement Standard
-
-The system utilizes:
-**"UPI payment initiation + transaction/reconciliation infrastructure"**
-
-> **CRITICAL SETTLEMENT PRINCIPLE:**
-> Local transaction references or client-side responses **never prove bank settlement**.
-> Only authoritative, cryptographically signed provider webhooks confirm funds in production.
-An order cannot transition to `COLLECTED` if `isBalancePaid == false`.
