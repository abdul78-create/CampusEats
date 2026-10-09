# CampusEats — Non-Negotiable Agent Rules

## Rule Set A — Security is Mandatory
1. Secure all API keys. Never expose secrets. Never hardcode credentials.
2. Keep `.env` and secret files out of source control.
3. Authentication is mandatory; permissions enforced server-side.
4. Never trust IDs, prices, or user data supplied by the frontend.
5. Strict tenant isolation (students isolated, stall owners isolated to their stall).
6. Lock down database access; parameterized Prisma queries; row-level locking.
7. Secure file uploads: magic bytes check, 5MB limit, SHA-256 checksum, private volume.
8. Rate-limit auth and sensitive endpoints.
9. Security headers via Helmet; restrictive CORS.
10. Uniform error envelopes masking stack traces and driver errors.
11. CampusEats invariants: payment idempotency keys, webhook HMAC verification, refund authorization isolation, masked PII views, SHA-256 hash-chained audit logging, concurrency protection on inventory and slots.

## Rule Set B — Anti-"AI-Vibe-Coding" Frontend Freeze & Guidelines
1. No frontend development before Phase 14 is complete and verified.
2. In Phase 15, strictly avoid:
   - excessive gradients, rainbow/neon palettes, purple+black AI dark mode
   - liquid-glass blur, excessive shadows, hyper-rounded cards
   - sparkle icons, glowing radial orbs, dot grids, animated arrows
   - emoji-based UI, 3-card feature spam, bento grids
   - fake testimonials, fake stats, 3-tier pricing tables
   - meaningless terminal windows, excessive hover animations
   - "It's not X, it's Y" copy, checkmark spam, pastel SaaS washes
   - missing skeleton/loading states, missing Terms/Privacy
3. Visual identity must be a grounded, high-clarity university operations tool.

## Architectural Sequence
Requirements -> Domain -> Database -> Backend Foundation -> Auth -> Student Verification -> Stall Operations -> Order Engine -> Scheduling Engine -> Payments -> Realtime -> Security Hardening -> Automated Testing -> Production Deployment -> Frontend, Finally.
Zero-assumption clean slate protocol.
