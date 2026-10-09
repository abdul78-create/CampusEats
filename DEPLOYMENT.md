# CampusEats — Production Deployment & Infrastructure Specification

## 1. System Topology & Infrastructure Layout

```
                                [INTERNET]
                                     │
                             HTTPS (Port 443)
                                     ▼
                ┌────────────────────────────────────────┐
                │        Cloudflare / Reverse Proxy      │
                │   DDoS Mitigation, SSL, Rate Limiting  │
                └────────────────────┬───────────────────┘
                                     │
                                     ▼
                ┌────────────────────────────────────────┐
                │          Nginx / API Gateway           │
                │  SSL Termination, Compression, Headers │
                └────────────────────┬───────────────────┘
                                     │
                     ┌───────────────┴───────────────┐
                     ▼                               ▼
       ┌───────────────────────────┐   ┌───────────────────────────┐
       │   Node.js API Instance 1  │   │   Node.js API Instance 2  │
       │   (TypeScript Express)    │   │   (TypeScript Express)    │
       └─────────────┬─────────────┘   └─────────────┬─────────────┘
                     │                               │
                     └───────────────┬───────────────┘
                                     │
             ┌───────────────────────┼───────────────────────┐
             ▼                       ▼                       ▼
┌─────────────────────────┐ ┌─────────────────┐ ┌─────────────────────────┐
│       PostgreSQL        │ │  Redis Cluster  │ │ Private Object Storage  │
│ Primary + Read Replicas │ │  Pub/Sub & Cache│ │ (S3 / GCS Identity Docs)│
└─────────────────────────┘ └─────────────────┘ └─────────────────────────┘
```

---

## 2. Environment Tiers

| Environment | Purpose | Database | Providers |
| :--- | :--- | :--- | :--- |
| **Development** | Local engineering and testing. | Local Docker PostgreSQL (`localhost:5432`). | `MockPaymentProvider`, `MockLivenessProvider`, `LocalStorageProvider`. |
| **Staging** | Pre-production validation and load testing. | Managed PostgreSQL (RDS/Cloud SQL) replica. | Sandbox UPI Gateway, Sandbox Biometric Liveness, Encrypted S3. |
| **Production** | Live campus launch. | Multi-AZ Managed PostgreSQL with automated WAL archiving. | Production Bank UPI Aggregator, Production Liveness Provider, High-Security Bucket. |

---

## 3. Database Migration Strategy

1. Development schema changes are recorded via `npx prisma migrate dev --name <migration_name>`.
2. In Staging and Production CI/CD pipelines, migrations are executed automatically via:
   ```bash
   npx prisma migrate deploy
   ```
3. Zero-downtime rules:
   - Destructive schema drops are barred in single releases.
   - Column additions must be nullable or possess defaults.
   - Index creations on large tables must use concurrent indexing options.

---

## 4. Health Checks & Process Management

1. **Liveness Probe**: `GET /health` — Returns 200 OK if Node event loop is responsive.
2. **Readiness Probe**: `GET /ready` — Executes shallow `SELECT 1` on PostgreSQL before signaling container ready for traffic.
3. **Graceful Shutdown**:
   - Catches `SIGTERM` / `SIGINT`.
   - Stops accepting new HTTP connections.
   - Allows active in-flight requests 10 seconds to finish.
   - Closes Prisma connection pools and Redis socket clients cleanly.
