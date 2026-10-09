# CampusEats — Developer Guide & Contribution Rules

## 1. Prerequisites & Tooling

- **Node.js**: `v20.0.0` or higher (`v25.x` fully supported).
- **Package Manager**: `npm` (v10+).
- **Database**: PostgreSQL 15+ (local or Docker container).
- **TypeScript**: `5.7+` running in strict mode (`"strict": true`).

---

## 2. Local Setup Instructions

```bash
# 1. Clone repository
git clone https://github.com/campuseats/campuseats.git
cd campuseats

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env to set your local PostgreSQL connection string

# 4. Generate Prisma Client
npm run prisma:generate

# 5. Run automated tests
npm test

# 6. Start development server
npm run dev
```

---

## 3. Architecture-First Development Rules

> **CRITICAL DEVELOPER CONSTRAINTS:**
> 1. **FRONTEND FREEZE**: Do NOT build React pages, dashboards, CSS layouts, or mock UI components until Phase 14 has passed verification.
> 2. **NO BUSINESS LOGIC IN CONTROLLERS**: HTTP controllers are strictly for decoding inputs, validating schemas, delegating to Application Use Cases, and returning HTTP response codes.
> 3. **NO IMPLICIT SETTLEMENT**: Do not write code that assumes payment is settled without an external provider verification token or webhook signature.
> 4. **DOMAIN INVARIANTS**: All entities must validate their own invariants (e.g. `AdvancePercentage` must be $\ge 50\%$).
> 5. **DATA MINIMIZATION**: Any DTO or response sent to food stall endpoints must pass through `MaskingUtil`.

---

## 4. Common Scripts Reference

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Starts server with hot-reload via `tsx`. |
| `npm run build` | Compiles TypeScript source to `./dist`. |
| `npm run typecheck`| Runs TypeScript compiler type-checking without emitting files. |
| `npm test` | Runs Jest automated test suite. |
| `npm run test:coverage`| Generates code coverage report. |
| `npm run prisma:generate`| Generates Prisma ORM TypeScript client. |
| `npm run prisma:migrate` | Runs Prisma development database migrations. |
