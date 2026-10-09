# CampusEats Platform

> **Production-Oriented Web Platform for University Food-Stall Pre-Ordering, Intelligent Pickup Scheduling, Stall Capacity Management, and Campus Lunch-Rush Congestion Reduction.**

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)]()
[![Tests](https://img.shields.io/badge/tests-197%20passed%20(22%20suites)-brightgreen.svg)]()
[![Architecture](https://img.shields.io/badge/Architecture-Modular%20Monolith-orange.svg)]()
[![Frontend](https://img.shields.io/badge/Frontend-FROZEN%20(Phase%2015)-red.svg)]()

> **BASELINE TEST METRIC NOTICE:**
> The lost previous Android implementation had 35 tests.
> **This new web platform established an initial Phase 0 baseline of 21 domain tests, expanded in Phase 0.1 to 42 passing tests, reached 57 in Phase 1/1.1, 100 in Phase 2, 111 in Phase 2.1, 129 in Phase 3, 136 in Phase 3.1, and now stands at 197 passing tests across 22 suites in Phase 4 with zero failures.** No legacy claims are carried over.

---

## 1. Executive Summary & Core Problem

During university peak lunch hours (typically 12:00 PM – 2:00 PM), campus food stalls face extreme congestion. Students with short 30-to-45-minute breaks spend 20+ minutes waiting in physical lines, while food stall kitchens get swamped by uncoordinated, simultaneous orders that exceed physical preparation capacity.

**CampusEats is NOT a generic restaurant delivery app.** It is a capacity-throttled, preparation-aware scheduling platform designed to solve:
$$\text{DEMAND} \longrightarrow \text{KITCHEN CAPACITY} \longrightarrow \text{PREPARATION} \longrightarrow \text{PICKUP SLOT} \longrightarrow \text{DYNAMIC RESCHEDULING}$$

### Key Differentiators
1. **Dynamic Pickup Scheduling**: Realistic calculation of earliest feasible pickup timestamps based on prep time, parallel kitchen capacity, live queue depth, and operational buffers.
2. **Multi-Stall Split Checkout**: Single checkout creating isolated `MASTER_ORDER` and per-stall `SUB_ORDER` items with decoupled lifecycles and fault-isolated refunds.
3. **Structured Partial Advance Payment**: Strictly enforced 50%–100% advance deposit policy via UPI, preserving liquidity while securing stall commitment.
4. **Verified Student Identity with Liveness**: Self-contained verification requiring ID cards and anti-spoofing challenge abstractions (blink, head turns) without direct university ERP dependency.
5. **Cryptographically Hash-Chained Audit Log**: Tamper-evident SHA-256 audit log tracking administrative, pricing, capacity, and refund actions.

---

## 2. Architecture-First Staged Development Strategy

CampusEats adheres strictly to an **Architecture-First** roadmap. **The frontend is frozen until Phase 14 is complete and verified.**

```
Phase 0  ──► Product Constitution & Requirements Freeze (Current)
Phase 1  ──► Domain Model & State Machines
Phase 2  ──► Database Architecture
Phase 3  ──► Backend Foundation & Shared Infrastructure
Phase 4  ──► Authentication & Authorization (RBAC)
Phase 5  ──► Student Verification & Liveness Provider
Phase 6  ──► Stall Operations, Inventory & Acceptance Strategy
Phase 7  ──► Order Engine (Master/Sub-Order Decomposition)
Phase 8  ──► Smart Scheduling / Capacity Engine
Phase 9  ──► Payments (UPI) & Isolated Refunds
Phase 10 ──► Realtime / Event Infrastructure
Phase 11 ──► Admin & Stall Owner APIs
Phase 12 ──► Security Hardening & Data Minimization
Phase 13 ──► Complete Automated Testing Suite
Phase 14 ──► Production Deployment & Infrastructure
---------------------------------------------------------------------
Phase 15 ──► Frontend, Finally (React Client)
Phase 16 ──► End-to-End QA & Production Demo
```

---

## 3. Platform Actors & Roles

| Role | Definition & Authority Scope |
| :--- | :--- |
| **`STUDENT`** | Verified campus student. Can browse open/busy stalls, configure orders across stalls, submit advance payments, view live pickup status, and collect food. |
| **`STALL_OWNER`** | Approved vendor entity owning a stall in a campus block. Configures kitchen capacity, operating hours, menu pricing, processing mode (Manual/Automatic), and delegates staff. |
| **`STALL_STAFF`** | Subordinate account scoped to a specific stall with explicit permissions (`MANAGE_ORDERS`, `MANAGE_MENU`, `VIEW_PAYMENTS`, `VIEW_ANALYTICS`, `MANAGE_INVENTORY`). |
| **`ADMIN`** | Platform-level administrator. Reviews student verifications, approves stalls, configures capacity overrides, manages isolated refunds, and audits hash-chains. |

---

## 4. Documentation Index

Detailed architectural specifications are maintained in the root documentation repository:

- 📋 [PRODUCT_SPEC.md](PRODUCT_SPEC.md): Comprehensive functional and business rules.
- 🏗️ [ARCHITECTURE.md](ARCHITECTURE.md): System topology, modular monolith structure, and data flows.
- 📐 [DOMAIN_MODEL.md](DOMAIN_MODEL.md): Core domain entities, value objects, and aggregate roots.
- 🗄️ [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md): Relational schema, indices, constraints, and Prisma mappings.
- 🔄 [ORDER_STATE_MACHINE.md](ORDER_STATE_MACHINE.md): Finite state machines for Master and Sub-Orders.
- 💳 [PAYMENT_SPEC.md](PAYMENT_SPEC.md): Partial payment (50%-100%), UPI lifecycle, and idempotency.
- 💸 [REFUND_SPEC.md](REFUND_SPEC.md): Fault-isolated cancellation and sub-order refund flows.
- ⏱️ [SCHEDULING_ENGINE.md](SCHEDULING_ENGINE.md): Mathematical capacity modeling and dynamic rescheduling.
- 🏪 [STALL_OPERATIONS.md](STALL_OPERATIONS.md): Operational states, manual vs automatic processing, and inventory.
- 🪪 [IDENTITY_VERIFICATION.md](IDENTITY_VERIFICATION.md): Liveness challenges and document storage pipeline.
- 🔑 [AUTHENTICATION.md](AUTHENTICATION.md): HMAC-signed JWTs, RefreshSession model, token rotation, and server-side revocation.
- 🛡️ [SECURITY.md](SECURITY.md): Threat model, data minimization, PII masking, and file upload rules.
- 📡 [API_SPEC.md](API_SPEC.md): REST endpoints, OpenAPI schemas, and error taxonomy.
- ⚡ [REALTIME_ARCHITECTURE.md](REALTIME_ARCHITECTURE.md): Event bus, WebSocket/SSE transports, and deduplication.
- 🔒 [AUDIT_LOG_SPEC.md](AUDIT_LOG_SPEC.md): SHA-256 hash chaining and tamper-evident verification.
- 🧪 [TEST_PLAN.md](TEST_PLAN.md): Test matrix spanning domain unit tests to race condition simulations.
- 🚀 [DEPLOYMENT.md](DEPLOYMENT.md): Production infrastructure, reverse proxy, PostgreSQL, and Redis.
- 🛠️ [DEVELOPMENT.md](DEVELOPMENT.md): Local developer setup, workflows, and conventions.
- 📝 [CHANGELOG.md](CHANGELOG.md): Historical record of versions and modifications.
- 🏛️ [ADR Directory](docs/adr/): Architecture Decision Records (ADR-001 through ADR-008).

---

## 5. Technology Stack & Directory Structure

```
campuseats/
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── jest.config.ts
├── prisma/
│   └── schema.prisma
├── docs/
│   └── adr/
├── src/
│   ├── app.ts                  # Minimal Express application scaffolding
│   ├── server.ts               # Server bootstrap & healthcheck
│   ├── shared/                 # Shared Kernel
│   │   ├── domain/             # AggregateRoot, Entity, ValueObject base classes
│   │   ├── errors/             # Domain & HTTP Error hierarchy
│   │   ├── infrastructure/     # PrismaClient, Logger, Idempotency
│   │   ├── security/           # PII Masking, Hash Chaining utils
│   │   └── types/              # Common result & pagination types
│   └── modules/                # Bounded Contexts
│       ├── identity/           # User, StudentProfile, Verification, Liveness
│       ├── stall/              # Stall, OperatingHours, Menu, Inventory, Capacity
│       ├── ordering/           # MasterOrder, SubOrder, State Machine
│       ├── scheduling/         # PickupSchedulingService, Queue models
│       ├── payment/            # PaymentProvider, Advance percentage rules, UPI
│       ├── realtime/           # DomainEvents, RealtimeGatewayProvider
│       └── audit/              # SHA-256 Hash Chaining Service, AuditLogger
└── tests/
    └── unit/                   # Pure domain unit tests
```

---

## 6. Quick Start (Development Backend)

```bash
# 1. Install dependencies
npm install

# 2. Setup environment variables
cp .env.example .env

# 3. Generate Prisma client
npm run prisma:generate

# 4. Run automated domain test suite
npm run test

# 5. Start development server (Health check only - NO UI)
npm run dev
```

Server endpoints available in Phase 0:
- `GET /health` - Server health status and environment check.
- `GET /api/v1/health` - Healthcheck endpoint with timestamp and uptime.
- `GET /api/v1/spec` - OpenAPI schema preview.
