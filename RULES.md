# CampusEats — Non-Negotiable Agent Development & Design Rulebook

This document defines the strict, non-negotiable rules governing the development of CampusEats across all phases.

---

## 1. Sequence & Development Order Constraint

**CRITICAL INVARIANT: NO FRONTEND BEFORE ARCHITECTURE IS READY.**

The development order must follow:
$$\text{Requirements} \longrightarrow \text{Domain} \longrightarrow \text{Database} \longrightarrow \text{Backend Foundation} \longrightarrow \text{Auth \& Permissions} \longrightarrow \text{Student Verification} \longrightarrow \text{Stall Operations} \longrightarrow \text{Order Engine} \longrightarrow \text{Scheduling Engine} \longrightarrow \text{Payments} \longrightarrow \text{Realtime} \longrightarrow \text{Security Hardening} \longrightarrow \text{Automated Testing} \longrightarrow \text{Production Deployment} \longrightarrow \text{Frontend, Finally}$$

Until Phase 14 (Production Deployment/Infrastructure) is complete and verified:
- **STRICTLY NO REACT PAGES.**
- **STRICTLY NO DASHBOARDS.**
- **STRICTLY NO UI COMPONENTS OR CSS DESIGN SYSTEMS.**
- **STRICTLY NO MOCK SCREENS.**
- Only minimal server health/test scaffolding where technically required.

---

## 2. Rule Set A — Mandatory Security Standards

Before any module or phase is considered complete, the following security checks are non-negotiable:

1. **Secure All API Keys**: Never expose keys in client code, public repos, or client bundles.
2. **Never Expose Secrets**: Environment variables with secrets must be restricted to backend runtime.
3. **Never Hardcode Credentials/Secrets**: All credentials must be loaded via validated environment variables.
4. **Keep `.env` and Secret Files Out of Source Control**: Strict `.gitignore` enforcement; provide only `.env.example` templates.
5. **Authentication is Mandatory**: Anonymous access to operational or private endpoints is strictly rejected.
6. **Permissions Enforced Server-Side**: Client-side authorization claims are never trusted; every mutation is checked on the server.
7. **Never Trust IDs/User Data Supplied by Frontend**: Tenant IDs, user IDs, prices, prep times, and roles must be derived from trusted sessions, never accepted raw from request bodies.
8. **Isolate Users' Data**: Strict tenant isolation. Students can only see their own orders; Stall Owners can only see their assigned stall data.
9. **Lock Down the Database**: Use least-privilege database users, parameterized queries (via Prisma ORM), and row-level locking for concurrent mutations.
10. **Secure Storage Volumes**: Uploaded documents are kept outside public web roots and accessed only through signed URLs or authenticated proxy streams.
11. **Protect Admin Routes**: Explicit role guards on all `/admin/*` and administrative endpoints with mandatory audit logging.
12. **Disable Production Debug Mode**: Suppress verbose debug flags, verbose logs, and dev tools in production.
13. **Don't Expose Sensitive Stack Traces/Errors**: Uniform error response envelope; internal exceptions, stack traces, and database driver errors are masked from clients.
14. **Validate Inputs Server-Side**: Comprehensive schema validation (Zod) on all incoming requests before application layer entry.
15. **Sanitize User-Controlled Content**: HTML escaping and sanitization on all free-text fields (item names, descriptions, reasons).
16. **Secure Every File Upload**: Validate magic bytes/MIME signatures, enforce 5MB limits, compute SHA-256 checksums, and store outside web roots.
17. **Protect Against SQL/NoSQL Injection**: Parameterized Prisma queries; raw SQL queries are strictly forbidden unless statically validated.
18. **Rate-Limit Sensitive Endpoints**: Rate limiting on `/auth/login`, `/auth/register`, checkout, and payment endpoints.
19. **Check Git History for Accidentally Committed Secrets**: Continuous verification that no secrets enter git trees.
20. **Configure Security Headers & Restrictive CORS**: Helmet middleware with HSTS, CSP, X-Frame-Options, X-Content-Type-Options; CORS restricted to whitelisted origin.
21. **Test Application as Untrusted User**: Automated penetration and unauthorized role access test suites.

### CampusEats Domain-Specific Security Rules
- **Payment Idempotency**: `Idempotency-Key` header mandatory on all financial mutations.
- **Cryptographic Webhook Verification**: HMAC signature verification on all incoming payment webhooks; raw bank references verified.
- **Refund Authorization**: Only automated system exceptions or authorized admins can initiate refunds; students cannot voluntarily trigger refunds on accepted orders.
- **Role Isolation**: Discrete roles (`STUDENT`, `STALL_OWNER`, `ADMIN`, `STALL_STAFF`) enforced server-side.
- **Sensitive ID-Card Protection**: Full student ID cards are never exposed to food stall workers; masked PII views only.
- **Liveness Data Protection**: Anti-spoofing challenge verification handled via secure provider abstraction; raw biometric data isolated.
- **Tamper-Evident Audit Logging**: SHA-256 cryptographically hash-chained audit trail anchored from `GENESIS_HASH`.
- **Concurrency & Inventory Protection**: Atomic database transactions and row-level locks on stock depletion to prevent race conditions during rushes.
- **Least-Privilege Staff Access**: Staff accounts restricted to explicit delegated permissions (`MANAGE_ORDERS`, `MANAGE_MENU`, etc.).

---

## 3. Rule Set B — Anti-"AI-Vibe-Coding" Design & Frontend Constitution

When Phase 15 (Frontend) is reached, the UI must look and feel like a **real, robust, university operational tool**, NOT an AI-generated template or generic SaaS mock.

### Strictly Avoid Common AI-Generated Tropes:
- ❌ **No excessive gradients** or rainbow/neon accent washes.
- ❌ **No generic "purple + black dark mode"** AI aesthetic.
- ❌ **No liquid-glass / glassy blur overload** that degrades readability.
- ❌ **No excessive drop shadows** or floating card soup.
- ❌ **No hyper-rounded card borders** (`border-radius: 3rem`).
- ❌ **No decorative sparkle / twinkle AI icons** ($\text{✨}$).
- ❌ **No random glowing radial orbs** or background blurred circles.
- ❌ **No dot-grid backgrounds** or generic blueprint patterns.
- ❌ **No unnecessary animated arrows** pointing at buttons.
- ❌ **No emoji-based primary UI** replacing professional iconography.
- ❌ **No generic three-card feature sections** or formulaic bento grids.
- ❌ **No fake testimonials** or fabricated product metrics.
- ❌ **No generic 3-tier pricing tables** (CampusEats is an ordering & scheduling platform, not a SaaS subscription).
- ❌ **No meaningless terminal / code-window decorations** on user pages.
- ❌ **No excessive micro-interaction hover jitter** that slows user task completion.
- ❌ **No generic "It's not X, it's Y" marketing copy**.
- ❌ **No bullet spam** with green checkmarks.
- ❌ **No pastel-washed startup templates** or blinding pure-white landing page voids.
- ❌ **No colored left-border accent spam** on every list item.
- ❌ **Never omit skeleton / loading states** or error boundaries.
- ❌ **Never omit Terms of Service or Privacy Policy pages**.

### Positive Aesthetic Directive for CampusEats:
- Design for **speed, high-density clarity, and legibility under campus daylight conditions**.
- Typography: Clean, legible sans-serif hierarchy engineered for tabular operational data (queue times, remaining balances, order counts).
- Color System: Grounded, functional color palette emphasizing status clarity (e.g. distinct, accessible status tokens for `PREPARING`, `READY`, `COLLECTED`).
- Mobile-First Counter Usability: Large, tactile touch targets for stall staff wearing gloves or students walking across campus.

---

## 4. Zero-Assumption Clean Slate Protocol

- Do not assume anything exists from any previous implementation.
- Everything is built cleanly from the verified specification.
- Each phase must be formally verified, type-checked, and tested before the subsequent phase begins.
