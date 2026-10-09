# ADR-004: Mathematical Pickup Scheduling and Dynamic Queue Engine

## Status
Accepted

## Context
Standard restaurant delivery applications present users with arbitrary preparation estimates (e.g., "15-20 mins") regardless of real-time kitchen congestion or parallel cooking capacity. In university food stalls with limited kitchen burners and counter space, this causes heavy crowd clustering during lunch hours.

## Decision
We create a dedicated domain service **`PickupSchedulingService`** that calculates realistic pickup times using real timestamps (not hardcoded 15-minute slot buckets):
$$T_{\text{feasible}} = T_{\text{now}} + T_{\text{prep}} + T_{\text{queue}} + B_{\text{ops}}$$
- $T_{\text{prep}}$ models item cooking duration and parallel batching limits.
- $T_{\text{queue}}$ models remaining prep time across all preceding active sub-orders divided by `parallelPreparationLimit`.
- $B_{\text{ops}}$ adds an operational buffer for plating and counter hand-off.
- The engine persists an explicit `SchedulingExplanation` breakdown with each schedule.
- When live queue pressure spikes unexpectedly, the engine dynamically recalculates affected orders, logs the shift, and emits `SCHEDULE_SHIFTED` events and push notifications.

## Consequences
### Positive
- Students arrive only when food is genuinely ready, flattening physical queues.
- Explanations build student trust by clarifying exact factors (item time vs queue congestion).
- Stalls can throttle incoming orders automatically when active queues reach configured limits.

### Negative
- Dynamic recalculation requires background queue polling or event-driven triggers when orders take longer than projected.
