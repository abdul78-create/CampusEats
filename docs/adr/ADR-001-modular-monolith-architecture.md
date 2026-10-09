# ADR-001: Modular Monolith Architecture over Microservices

## Status
Accepted

## Context
CampusEats serves a concentrated campus population during severe lunch-time demand spikes (12:00 PM - 2:00 PM). During these rush periods, transactions span multiple modules: Identity verification, Stall capacity calculation, Multi-stall order splitting, UPI payment settlement, and Audit logging.

Adopting a microservices architecture early would introduce significant network latency, distributed transaction failure modes (2PC / Sagas), distributed tracing overhead, and complex infrastructure operations.

## Decision
We adopt a **Modular Monolith** pattern using TypeScript and Node.js.
- Bounded contexts (`identity`, `stall`, `ordering`, `scheduling`, `payment`, `realtime`, `audit`) are physically segregated into separate modules.
- Inter-module communication occurs strictly via explicit in-process application service interfaces or asynchronous domain events.
- Direct cross-module database table joins are prohibited in application code.
- Clean Architecture ensures the domain layer is decoupled from frameworks, ORMs, and transport protocols.

## Consequences
### Positive
- Single database deployment simplifies atomic transactions (e.g., creating MasterOrder and decomposed SubOrders atomically).
- Low latency in-memory method execution across bounded contexts.
- Simple local development and automated testing environments.
- Well-defined boundaries preserve the option to extract specific modules (such as Realtime or Payments) into standalone microservices if traffic warrants it in the future.

### Negative
- All modules share a common Node.js process runtime during deployment.
- High discipline is required to prevent engineers from bypassing module boundaries (enforced via ESLint module boundaries and code review).
