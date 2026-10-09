# CampusEats — Domain Model Specification

## 1. Ubiquitous Language & Core Terminology

| Term | Domain Definition |
| :--- | :--- |
| **Student** | A university scholar registered and verified via ID card and 3-step liveness. |
| **Stall** | A physical food counter situated within an identified campus block. |
| **MasterOrder** | The parent transaction generated at checkout containing customer information and payment session. |
| **SubOrder** | A discrete operational unit of work belonging to exactly one Stall, possessing an independent lifecycle. |
| **OrderItem** | An immutable snapshot of an ordered dish capturing name, price, prep time, and quantity at moment of purchase. |
| **PickupSchedule** | The calculated timestamp and queue explanation detailing when a SubOrder will be ready for pickup. |
| **Advance Payment** | Mandatory upfront deposit of between 50% and 100% required to commit kitchen preparation. |
| **Isolated Refund** | Financial reversal strictly scoped to a single failed or cancelled SubOrder, keeping other sub-orders active. |
| **Liveness Challenge** | Interactive camera check verifying a living human (blink, head left, head right) without direct ERP integration. |
| **Hash-Chained Audit**| Cryptographic SHA-256 sequential linking where each audit entry incorporates the digest of the prior log. |

---

## 2. Aggregates & Entities

```
+-------------------------------------------------------------+
|                     AGGREGATE: MASTER_ORDER                 |
|  - id: MasterOrderId                                        |
|  - studentId: StudentId                                     |
|  - orderNumber: String                                      |
|  - status: MasterOrderStatus                                |
|  - totalAmount: Money                                       |
|  - advancePercentage: AdvancePercentage (50..100)           |
|  - advanceAmount: Money                                     |
|  - remainingAmount: Money                                   |
|  - amountPaid: Money                                        |
|                                                             |
|  +-- Entities:                                              |
|      * SubOrder (1..*)                                      |
|          - id: SubOrderId                                   |
|          - stallId: StallId                                 |
|          - status: SubOrderStatus                           |
|          - subtotalAmount: Money                            |
|          - advancePaidAmount: Money                         |
|          - balanceDueAmount: Money                          |
|          - OrderItems (1..*)                                |
|              - snapshotItemName: String                     |
|              - snapshotPrice: Money                         |
|              - snapshotPrepMinutes: Int                     |
|              - quantity: Int                                |
|          - PickupSchedule (1)                               |
|              - scheduledPickupTime: DateTime                |
|              - explanation: SchedulingExplanation           |
|          - Refund (0..1)                                    |
|              - refundAmount: Money                          |
|              - refundStatus: RefundStatus                   |
+-------------------------------------------------------------+
```

```
+-------------------------------------------------------------+
|                        AGGREGATE: STALL                     |
|  - id: StallId                                              |
|  - ownerId: UserId                                          |
|  - name: String                                             |
|  - campusBlock: String                                      |
|  - liveStatus: StallStatus (CLOSED|OPEN|BUSY|PAUSED)        |
|  - processingMode: OrderProcessingMode (MANUAL|AUTOMATIC)   |
|  - isApproved: Boolean                                      |
|                                                             |
|  +-- Entities & Value Objects:                              |
|      * StallOperatingHour (0..7)                            |
|      * StallCapacity (1)                                    |
|          - maxActiveOrders: Int                             |
|          - parallelPreparationLimit: Int                    |
|          - operationalBufferMinutes: Int                    |
|          - pickupGracePeriodMinutes: Int                    |
|      * MenuItem (0..*)                                      |
|          - price: Money                                     |
|          - preparationTimeMinutes: Int                      |
|          - availabilityState: ItemAvailabilityState         |
|          - Inventory: AvailableQty & ReservedQty            |
|      * StaffAccount (0..*)                                  |
|          - delegatedPermissions: Set<StaffPermissionType>   |
+-------------------------------------------------------------+
```

```
+-------------------------------------------------------------+
|                AGGREGATE: STUDENT_PROFILE                   |
|  - id: StudentProfileId                                     |
|  - userId: UserId                                           |
|  - fullName: String                                         |
|  - universityRegNumber: RegistrationNumber                  |
|  - accountStatus: StudentAccountStatus                      |
|                                                             |
|  +-- Entities:                                              |
|      * StudentVerification (1..*)                           |
|          - status: VerificationStatus                       |
|          - IdentityDocument (1)                             |
|              - storagePath: String                          |
|              - sha256Checksum: String                       |
|          - LivenessVerification (1)                         |
|              - blinkPassed: Boolean                         |
|              - headTurnLeftPassed: Boolean                  |
|              - headTurnRightPassed: Boolean                 |
+-------------------------------------------------------------+
```

---

## 3. Value Objects & Invariants

### 3.1 `AdvancePercentage`
- Invariant: Must belong to allowed discrete values: $[50, 60, 70, 80, 90, 100]$.
- Violations: $0, 25, 49, 105$ reject with `InvalidAdvancePercentageError`.

### 3.2 `Money`
- Precision: Fixed 2-decimal digits (in INR ₹).
- Negative monetary values are strictly prohibited.
- Currency operations must use integer-cent arithmetic or `Prisma.Decimal` to avoid floating-point drift.

### 3.3 `SchedulingExplanation`
- Encapsulates exact factors contributing to computed pickup time:
  - `preparationTimeMinutes`: Max cooking time required by items in the sub-order.
  - `queueDelayMinutes`: Cumulative cooking time of predecessor sub-orders currently queued in the stall kitchen.
  - `operationalBufferMinutes`: Configured stall buffer to allow packaging and counter hand-off.
  - `capacityConstraintApplied`: Boolean indicating if parallel preparation limits were saturated.
  - `earliestFeasibleTime`: Timestamp representing the minimum realistic pickup moment.

### 3.4 `RegistrationNumber`
- University registration string normalized and validated.
- Masking helper: displays prefix and last 4 digits (e.g. `2024••••9842`).

---

## 4. Domain Invariants & Rules

1. **Verification Gate**:
   `MasterOrder.create()` requires `StudentProfile.accountStatus === 'ACTIVE'`. Any attempt by `PENDING_VERIFICATION`, `SUSPENDED`, or `REJECTED` accounts throws `UnverifiedStudentError`.
2. **Resource-Level Authorization (Role + Permission + Scope)**:
   Every query and mutation verifies ownership. Students can only access their own resources (IDOR defense); stall owners/staff can only access assigned stalls (BOLA defense).
3. **Pickup Mutation Gate**:
   Students can never mutate a sub-order to `COLLECTED`. Only an authorized stall owner or staff member with `MANAGE_ORDERS` can confirm collection.
4. **Counter Payment Gate**:
   Students cannot self-declare cash payments. Counter payments require authenticated staff verification (`VIEW_PAYMENTS`).
5. **Operating Hours vs Live Status Gate**:
   Official operating hours are governed strictly by `ADMIN`. A stall owner cannot open or receive orders outside admin-configured hours.
6. **Refund Eligibility vs Administrative Refund**:
   Stall owners do not have open refund authority; they reject or report failures, creating refund eligibility. Direct administrative refunds are restricted to platform `ADMIN`.
7. **Order Immutability Snapshot**:
   When an order is created, `OrderItem` records clone the `MenuItem` name, unit price, and prep minutes. Subsequent menu updates or stall deletions have zero effect on existing orders.
8. **Capacity Threshold Enforcement**:
   A stall cannot transition a sub-order to `CONFIRMED` if active orders in the current window exceed `maxActiveOrders`.
9. **Isolated Sub-Order Independence**:
   Rejection or cancellation of `SubOrder[0]` updates only its status and triggers its isolated refund. It does not mutate `SubOrder[1]`.



Isolaed;
