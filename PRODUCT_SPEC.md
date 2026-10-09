# CampusEats — Product Specification

## 1. Product Identity & Problem Statement

### 1.1 The Campus Lunch Rush Reality
University dining ecosystems experience severe, predictable demand spikes during lunch breaks (typically 12:00 PM to 2:00 PM). During these windows:
- 2,000–5,000 students disperse across 10–20 campus food stalls within a 45-minute lunch break.
- Individual students spend 20–30 minutes queueing at physical counters just to place orders and wait for preparation.
- Food stall kitchens face uncontrolled bursts of walk-up and phone orders exceeding their physical cooking, plating, and counter hand-off capacities.
- Unpredictable bottlenecks cause high food waste, missed classes, cold pickups, and dissatisfied vendors.

### 1.2 System Purpose
CampusEats is an intelligent campus food-stall pre-ordering, dynamic pickup scheduling, and kitchen capacity management platform. Its objective is to **flatten peak counter queues into manageable, scheduled order pipelines** while preserving flexibility for both students and stall operators.

The core engineering lifecycle is:
$$\text{STUDENT DEMAND} \longrightarrow \text{STALL CAPACITY CHECK} \longrightarrow \text{PREP WORKLOAD MODELING} \longrightarrow \text{DYNAMIC PICKUP SLOT} \longrightarrow \text{ACTIVE RESCHEDULING}$$

---

## 2. Platform Actors & Permissions

CampusEats strictly defines four server-enforced roles without arbitrary escalation:

### 2.1 STUDENT
- Must be a verified student of the university campus.
- Has one profile tied to a valid university registration number, student ID document, and verified liveness check.
- Capabilities:
  - Browse campus blocks and approved food stalls.
  - Inspect live stall states (`OPEN`, `BUSY`, `TEMPORARILY_PAUSED`).
  - View real-time menus, prices, preparation times, veg/non-veg flags, and allergen declarations.
  - Assemble multi-stall shopping carts and perform a single split-checkout.
  - Select advance payment percentages ($50\%, 60\%, 70\%, 80\%, 90\%, 100\%$).
  - Review scheduling explanations (e.g., preparation delay, queue delay, buffer).
  - Track real-time preparation status and receive reschedule push notifications.
  - Pick up food at stall counters using masked verification credentials.

### 2.2 STALL_OWNER
- Approved commercial vendor operating an authorized food stall on campus grounds.
- Capabilities:
  - Toggle live operational states (`CLOSED`, `OPEN`, `BUSY`, `TEMPORARILY_PAUSED`).
  - Define operating hours by day of the week.
  - Configure kitchen capacity constraints (max active orders, window throughput, parallel cooking limits, buffer minutes).
  - Manage menu items, prices, preparation times, and real-time inventory counts.
  - Select order processing mode: `MANUAL` (accept/reject) or `AUTOMATIC` (engine-accepted).
  - Provision and supervise `STALL_STAFF` accounts with delegated granular permissions.
  - Review live orders, mark orders as `PREPARING` and `READY`, and complete pickups.

### 2.3 STALL_STAFF
- Subordinate staff account linked to one specific stall.
- Has explicit permissions granted by the `STALL_OWNER`:
  - `MANAGE_ORDERS`: Transition sub-orders between `CONFIRMED`, `PREPARING`, `READY`, and `COLLECTED`.
  - `MANAGE_MENU`: Edit item descriptions and toggle sold-out statuses.
  - `MANAGE_INVENTORY`: Increment or decrement real-time stock levels.
  - `VIEW_PAYMENTS`: Inspect advance paid and balance due for orders at the stall.
  - `VIEW_ANALYTICS`: Review stall throughput and average prep times.
- Explicitly barred from accessing owner-only features (e.g., staff provisioning, stall deletion, payout modifications).

### 2.4 ADMIN
- Platform-level university operations administrator.
- Capabilities:
  - Review and approve/reject student registration verifications.
  - Onboard, approve, or suspend food stalls.
  - Configure campus-wide capacity limits or emergency operational pauses.
  - Inspect cross-stall order volumes, payment reconciliations, and queue congestion heatmaps.
  - Adjudicate operational exceptions and process isolated administrative refunds.
  - Inspect the tamper-evident SHA-256 cryptographically hash-chained audit log.

---

## 3. Core Business Rules

### 3.1 Student Account Lifecycle & Verification Gates
1. A registered user begins in state `PENDING_VERIFICATION`.
2. To achieve `ACTIVE` status, the student must provide:
   - Full legal name.
   - Mobile phone number (unique, validated).
   - Email address (unique).
   - University registration number (unique).
   - High-resolution photograph of the official University ID card.
   - Live selfie capture for liveness verification.
3. Verification is performed directly by CampusEats (no direct coupling to university ERP APIs).
4. The liveness pipeline executes a 3-challenge sequence:
   - Challenge 1: Natural blink.
   - Challenge 2: Head turn left.
   - Challenge 3: Head turn right.
5. Verification status values: `PENDING`, `APPROVED`, `REJECTED`.
6. Account status values: `PENDING_VERIFICATION`, `ACTIVE`, `SUSPENDED`, `REJECTED`.
7. **Rule:** An account that is not in the `ACTIVE` state is **strictly barred from placing orders**.

### 3.2 Ordering & Multi-Stall Splitting
1. Students can combine items from multiple distinct stalls in a single checkout.
2. Checkout generates:
   - One `MASTER_ORDER`: Represents the overarching customer purchase, student reference, total amount, and consolidated payment session.
   - Multiple `SUB_ORDER` records: Exactly one `SUB_ORDER` per stall included in the cart.
3. Each `SUB_ORDER` operates independently:
   - Has its own unique sub-order tracking number.
   - Has its own preparation time, kitchen queue slot, and scheduled pickup time.
   - Maintains its own finite state machine.
   - Rejection, cancellation, or failure of Stall A’s sub-order **never** impacts Stall B’s sub-order.

### 3.3 Order Immutability
1. Once advance payment is confirmed by the payment gateway, the order is **immutable**.
2. Neither the student nor stall staff may:
   - Add new items.
   - Remove items.
   - Change item quantities.
   - Alter item prices or applied discounts.
3. Any additional food required must be placed as a distinct, new order.

### 3.4 Partial Advance Payment Model
1. The student must pay a minimum of **50% advance deposit** at checkout.
2. Allowed advance percentages:
   $$\text{Advance Percentage} \in \{50\%, 60\%, 70\%, 80\%, 90\%, 100\%\}$$
3. A selection of $0\%$ or anything under $50\%$ is strictly rejected by domain validation.
4. Calculations:
   $$\text{Advance Amount} = \text{Total Amount} \times \left(\frac{\text{Advance Percentage}}{100}\right)$$
   $$\text{Remaining Balance} = \text{Total Amount} - \text{Advance Amount}$$
5. The remaining balance can be settled prior to pickup via online UPI or in person at the stall counter before handover.

### 3.5 Payment Lifecycle & UPI Integration
1. Supported checkout rails: UPI (Google Pay, PhonePe, Paytm, BHIM, generic UPI intent/QR).
2. The payment lifecycle:
   $$\text{Initiate Payment} \longrightarrow \text{Gateway Client Session} \longrightarrow \text{Server Verification Webhook} \longrightarrow \text{Reconciliation}$$
3. Local transaction IDs are never accepted as proof of settlement; only cryptographic gateway webhook signatures confirm payment.
4. Payment failure does not create orphan orders or duplicate records. Payment retries are protected by unique idempotency keys.

### 3.6 Cancellation & Fault-Isolated Refunds
1. **General Rule:** Once an order is paid and confirmed, **no voluntary cancellations or refunds are permitted** by students.
2. **Authorized Exceptions:**
   - Stall rejects the order (in manual processing mode).
   - Stall unexpectedly goes offline or closes due to an emergency.
   - Ordered item runs out of stock after order creation.
   - Administrative override due to operational failure.
3. **Refund Scope:**
   - Only the affected `SUB_ORDER` is cancelled and moved to `REFUND_PENDING` $\rightarrow$ `REFUNDED`.
   - The remaining sub-orders proceed without interruption.
   - Exact refunded amounts reflect the actual advance paid for the specific sub-order items.

### 3.7 Stall State Engine & Operating Modes
1. Live stall states:
   - `CLOSED`: Counter is shut; no orders accepted.
   - `OPEN`: Counter is operating normally; orders accepted.
   - `BUSY`: Kitchen is approaching maximum queue capacity; pickup estimates automatically increase.
   - `TEMPORARILY_PAUSED`: Owner paused incoming orders to clear existing kitchen backlog.
2. Operating hours govern scheduled availability, but stall activation requires explicit owner or authorized staff initiation.
3. Processing Modes:
   - `MANUAL`: Every new sub-order must be explicitly accepted or rejected by stall staff within a configured timeout window.
   - `AUTOMATIC`: System validates kitchen capacity, item stock, and pickup feasibility, then immediately transitions order to `CONFIRMED`.

### 3.8 Pickup Protocol & Expiry Policy
1. When all items of a sub-order are cooked and packaged, staff marks the sub-order `READY`.
2. The student arrives at the designated stall pickup counter and presents the sub-order number.
3. Staff verifies the student's name, profile photo, and masked registration number on their terminal.
4. If a remaining balance is due, payment is collected/verified before food handover.
5. The sub-order transitions to `COLLECTED`.
6. **Grace Period & Expiry:**
   - Each stall has a configurable pickup grace period (default: 15 minutes after scheduled pickup time).
   - If uncollected after the grace period, the sub-order transitions to `EXPIRED` or `MISSED_PICKUP`.
   - **No refund is issued for expired orders.** Food quality degradation past the pickup window is the customer's responsibility.

---

## 4. Privacy & Data Minimization Rules
1. Ordinary stall staff must never have access to full university ID cards or unmasked identity data.
2. Data masking formats:
   - Student Registration: `2024••••9842`
   - Mobile Number: `+91 ••••• 3210`
   - UPI Virtual Address: `st•••@okaxis`
3. All sensitive PII document access by admins is recorded in the cryptographically chained audit log.
