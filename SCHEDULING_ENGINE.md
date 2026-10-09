# CampusEats — Scheduling & Capacity Engine Specification

## 1. Engine Purpose & Intellectual Core

The fundamental challenge in university food operations is not menu browsing or payment processing; it is **kitchen workload modeling and queue de-congestion**.

Traditional restaurant apps assign arbitrary, fixed pickup times (e.g. "Ready in 15 minutes"), resulting in massive physical crowds at counters when multiple orders converge on a kitchen with limited burners and prep staff.

CampusEats implements a dedicated **`PickupSchedulingService`** that calculates realistic, feasible pickup timestamps based on physical kitchen capacity and dynamic live queue depth.

---

## 2. Mathematical Formulation & Workload Modeling

### 2.1 Variables & Parameters
Let:
- $T_{\text{now}}$: Current server timestamp (in epoch seconds or minutes).
- $Items = \{ (item_1, q_1), (item_2, q_2), \dots, (item_k, q_k) \}$: Items in the candidate `SubOrder`.
- $p_i$: Preparation time (in minutes) for a unit of $item_i$.
- $K_{\text{parallel}}$: Number of parallel cooking/prep lines available at the stall kitchen (`parallelPreparationLimit`, default: 4).
- $B_{\text{ops}}$: Configured stall operational buffer (`operationalBufferMinutes`, default: 2 mins) for plating, wrapping, and counter transfer.
- $Q_{\text{active}}$: Set of active sub-orders currently in states `CONFIRMED` or `PREPARING` at the stall.

### 2.2 Order Preparation Workload ($T_{\text{prep}}$) Across Parallel Stations
Items in an order are **NOT** added sequentially if multiple parallel kitchen preparation stations exist.

Instead, dish commitments are assigned across available parallel stations ($K_{\text{parallel}}$) using a **Longest Processing Time (LPT) makespan scheduling model**:

$$\text{Station Makespan} = \max_{j \in [1..K]} \left( \sum_{i \in \text{Assigned}(j)} p_i \right)$$
$$T_{\text{prep}} = \text{Station Makespan}$$

#### Example Demonstration
- Samosa preparation: $10$ minutes
- Dosa preparation: $8$ minutes
- Parallel stations: $2$
- **Result:** Station 1 handles Samosa ($10$m), Station 2 handles Dosa ($8$m).
- $\text{Total Preparation Workload } T_{\text{prep}} = \max(10, 8) = \mathbf{10\text{ minutes}}$ (NOT $10 + 8 = 18$ minutes).
- If constrained to $1$ station: $10 + 8 = \mathbf{18\text{ minutes}}$.

The scheduler reasons directly about physical station availability rather than naïve linear arithmetic.

### 2.3 Live Kitchen Queue Delay ($T_{\text{queue}}$)
The queue delay accounts for earlier orders occupying kitchen capacity:
$$T_{\text{queue}} = \sum_{O \in Q_{\text{active}}} \frac{\text{remaining\_prep}(O)}{K_{\text{parallel}}}$$

### 2.4 Earliest Feasible Pickup Time ($T_{\text{feasible}}$)
$$T_{\text{feasible}} = T_{\text{now}} + T_{\text{prep}} + T_{\text{queue}} + B_{\text{ops}}$$

### 2.5 Validation of Requested Pickup Time ($T_{\text{requested}}$)
If a student requests a future pickup timestamp $T_{\text{requested}}$ (e.g. "I want to pick up at 12:45"):
$$\text{Is Feasible} = T_{\text{requested}} \ge T_{\text{feasible}}$$

If $T_{\text{requested}} < T_{\text{feasible}}$, the request is rejected as **infeasible**, and the system proposes $T_{\text{feasible}}$ alongside the complete explanation breakdown.

---

## 3. Scheduling Explanation Structure

The scheduler stores a transparent explanation record with every pickup schedule:

```typescript
export interface SchedulingExplanation {
  preparationTimeMinutes: number;      // e.g. 10 mins (longest item prep)
  queueDelayMinutes: number;           // e.g. 12 mins (3 orders ahead on 2 burners)
  operationalBufferMinutes: number;    // e.g. 2 mins (plating & staging)
  capacityConstraintApplied: boolean;  // true if parallel limits prolonged wait
  earliestFeasibleTime: Date;          // calculated minimum timestamp
  calculatedAt: Date;                  // computation timestamp
}
```

This data is exposed to students transparently so they understand why an order requires 24 minutes instead of an arbitrary guess.

---

## 4. Continuous Dynamic Rescheduling

### 4.1 Queue Shift Scenario
During peak moments, an unexpected batch of orders or kitchen equipment slowdown can cause an active stall to exceed projected throughput.

```
Initial Prediction:
Order #104: Estimated 12:50 PM

Sudden Queue Surge at 12:35 PM:
2 large orders accepted in Automatic mode.
Calculated backlog delay increases by +12 minutes.
New Feasible Pickup for Order #104: 13:02 PM.
```

### 4.2 The `SCHEDULE_SHIFTED` Event
1. The `PickupSchedulingService` runs recomputation triggers when queue depths change significantly (> 5-minute variance).
2. The `PickupSchedule` record is updated with:
   - `rescheduleCount`: incremented by 1.
   - `rescheduleReason`: `KITCHEN_CONGESTION_SURGE`.
   - `scheduledPickupTime`: updated to the new realistic timestamp.
3. The platform publishes a `SCHEDULE_SHIFTED` domain event to the realtime bus.
4. An in-app push notification is dispatched to the student:
   > *"Stall Update: Due to high kitchen volume, your pickup for SubOrder #104 has been adjusted to 1:02 PM."*
5. **Core Rule:** The system **never silently shifts pickup times**. Every adjustment is published, logged in audit records, and notified to the student.

---

## 5. Capacity Throttling & Stall State Transition

To prevent catastrophic kitchen overload, the scheduler actively modulates stall live status:

1. **Threshold 1 (`NORMAL` $\rightarrow$ `BUSY`)**:
   When active kitchen queue workload exceeds $80\%$ of `maxOrdersPerWindow`, the stall automatically flags as `BUSY`. Students browsing the stall see a banner: *"High rush: Prep times extended by ~15 mins."*
2. **Threshold 2 (`BUSY` $\rightarrow$ `THROTTLED`)**:
   When active queue reaches $100\%$ capacity, new incoming order acceptance is paused until active orders complete and drop below $75\%$ capacity.
