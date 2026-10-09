# CampusEats — Production Secrets & Environment Variables Runbook

## 1. Executive Summary

CampusEats enforces strict cryptographic boundaries across authentication, identity verification, session persistence, payment webhooks, and object storage.

In production (`NODE_ENV=production`), the application runs runtime assertions that immediately terminate process startup if weak or mock secrets are detected. This document provides the authoritative runbook for generating, configuring, rotating, and securing production environment variables.

---

## 2. Secrets Inventory & Specification

| Secret Variable | Minimum Length | Format / Encoding | Purpose | Security Invariant / Validation Rule |
| :--- | :--- | :--- | :--- | :--- |
| `POSTGRES_PASSWORD` | 32 chars | Alphanumeric + Symbols | Database master password for `campuseats_prod_user` | Required for secure PostgreSQL connection with `sslmode=require` |
| `JWT_SECRET` | 32 chars | 256-bit Hex (`openssl rand -hex 32`) | HMAC-SHA256 signature for 15-minute access tokens | `TokenService` throws fatal error if length < 32 characters in production |
| `JWT_REFRESH_SECRET` | 32 chars | 256-bit Hex (`openssl rand -hex 32`) | Cryptographic signature for 7-day refresh tokens | `TokenService` throws fatal error if length < 32 characters in production |
| `COOKIE_SECRET` | 32 chars | 256-bit Hex (`openssl rand -hex 32`) | Cookie signing secret | Used for session cookie integrity verification |
| `STORAGE_SIGNING_SECRET` | 32 chars | 256-bit Hex (`openssl rand -hex 32`) | HMAC-SHA256 token generator for 5-minute signed document URLs | Used by `StorageProvider` for temporary, authenticated document access |
| `WEBHOOK_SIGNING_SECRET` | 32 chars | 256-bit Hex or Provider Key | HMAC-SHA256 signature verification for UPI webhooks | Verified by `PaymentProvider` on inbound webhook notifications |
| `LIVENESS_API_KEY` | Varies | Provider specific | Production biometric verification API key | `validateLivenessProviderConfig()` strictly forbids `LIVENESS_PROVIDER="mock"` in production |
| `LIVENESS_API_SECRET` | Varies | Provider specific | Production biometric verification API secret | Paired with `LIVENESS_API_KEY` for biometric identity verification |
| `PAYMENT_GATEWAY_KEY_ID` | Varies | Provider specific | Merchant gateway API key | Issued by certified payment aggregator (Razorpay, PhonePe, Paytm) |
| `PAYMENT_GATEWAY_KEY_SECRET` | Varies | Provider specific | Merchant gateway API secret | Private secret used to authenticate server-to-server payment requests |

---

## 3. Cryptographic Secret Generation Commands

### Option A: OpenSSL (Linux, macOS, WSL, Git Bash)
```bash
# Generate a 256-bit (32-byte) hex string (64 characters):
openssl rand -hex 32

# Generate a base64 encoded secret:
openssl rand -base64 32
```

### Option B: Node.js (Cross-Platform)
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Option C: Windows PowerShell
```powershell
[Convert]::ToHexString((1..32 | ForEach-Object { [byte](Get-Random -Minimum 0 -Maximum 256) }))
```

---

## 4. Environment Variables Checklist: Placeholders vs. Real Production

> [!WARNING]
> NEVER copy development values (such as `campuseats_password` or `super_secret_jwt_key...`) to production. The production templates (`.env.production.example` and `frontend/.env.example`) contain explicit placeholder markers that must be replaced.

### 4.1 Backend Environment Configuration (`.env.production`)

```bash
# 1. Server Configuration
NODE_ENV=production
PORT=4000
HOST=0.0.0.0
API_PREFIX=/api/v1

# 2. Database Connection (PostgreSQL 16+)
POSTGRES_USER=campuseats_prod_user
POSTGRES_PASSWORD=<GENERATE_VIA_OPENSSL>
POSTGRES_DB=campuseats_prod
POSTGRES_PORT=5432
POSTGRES_HOST=postgres
DATABASE_URL=postgresql://campuseats_prod_user:<PASSWORD>@postgres:5432/campuseats_prod?schema=public&sslmode=require&connection_limit=20&pool_timeout=30

# 3. Cryptographic Secrets (All >= 32 characters)
JWT_SECRET=<GENERATE_VIA_OPENSSL_HEX_32>
JWT_ACCESS_EXPIRATION=15m
JWT_REFRESH_SECRET=<GENERATE_VIA_OPENSSL_HEX_32>
JWT_REFRESH_EXPIRATION=7d
COOKIE_SECRET=<GENERATE_VIA_OPENSSL_HEX_32>

# 4. CORS Policy (Explicit HTTPS domain)
CORS_ORIGIN=https://campuseats.university.edu

# 5. Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# 6. Object Storage (Private Identity Documents)
STORAGE_PROVIDER=s3
STORAGE_BUCKET=campuseats-production-identity-documents
STORAGE_REGION=ap-south-1
STORAGE_ACCESS_KEY_ID=<IAM_ACCESS_KEY_ID>
STORAGE_SECRET_ACCESS_KEY=<IAM_SECRET_ACCESS_KEY>
STORAGE_SIGNING_SECRET=<GENERATE_VIA_OPENSSL_HEX_32>
STORAGE_LOCAL_ROOT=./storage/uploads

# 7. Identity Liveness Provider (Certified Biometrics)
# Note: "mock" throws a fatal error in production!
LIVENESS_PROVIDER=AWS_REKOGNITION
LIVENESS_API_KEY=<BIOMETRIC_PROVIDER_KEY>
LIVENESS_API_SECRET=<BIOMETRIC_PROVIDER_SECRET>
LIVENESS_MIN_CONFIDENCE=80

# 8. Payment & UPI Configuration
PAYMENT_PROVIDER=razorpay
PAYMENT_GATEWAY_KEY_ID=<MERCHANT_KEY_ID>
PAYMENT_GATEWAY_KEY_SECRET=<MERCHANT_KEY_SECRET>
UPI_MERCHANT_VPA=campuseats@icici
UPI_MERCHANT_NAME=CampusEats Dining Services
WEBHOOK_SIGNING_SECRET=<GENERATE_OR_COPY_FROM_GATEWAY_DASHBOARD>

# 9. Realtime Infrastructure
REALTIME_TRANSPORT=sse
SSE_HEARTBEAT_INTERVAL_MS=30000

# 10. Audit Chain Genesis Block Anchor
AUDIT_GENESIS_HASH=0000000000000000000000000000000000000000000000000000000000000000
```

### 4.2 Frontend Environment Configuration (`frontend/.env.local` or container env)

```bash
# Production API URL (Exposed to browser client via Next.js)
NEXT_PUBLIC_API_BASE_URL=https://api.campuseats.university.edu
NEXT_PUBLIC_APP_NAME=CampusEats
NEXT_PUBLIC_APP_ENV=production
```

> [!NOTE]
> When the frontend is served behind the same reverse proxy (e.g. Nginx routing `/api/v1/*` to the backend on port 4000 and all other routes to Next.js on port 3000), `NEXT_PUBLIC_API_BASE_URL` can simply be left as `/api/v1` or empty, eliminating cross-origin CORS overhead entirely.

---

## 5. Secret Storage & Secret Management Best Practices

1. **Never Commit Secrets**: Ensure `.gitignore` explicitly prevents `.env`, `.env.*` (except `.env.example` and `.env.production.example`) from being committed to Git.
2. **Container Orchestration Injection**:
   - In Docker Compose: Use Docker Secrets or pass environment variables via a dedicated external file (`env_file: [ .env.production ]`) that is injected during deployment.
   - In Kubernetes: Use Kubernetes `Secret` objects or external secret operators (HashiCorp Vault, AWS Secrets Manager, GCP Secret Manager).
3. **Environment Segregation**:
   - Secrets used in Staging must never be reused in Production.
   - Database credentials must have distinct usernames and database names between environments.
4. **Least Privilege**:
   - S3/GCS IAM credentials should only have `s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject` permissions on the dedicated private bucket.
   - The PostgreSQL user should only possess CRUD permissions on tables in the `public` schema without superuser privileges.

---

## 6. Zero-Leakage Verification Checklist

Before publishing or deploying:
- [ ] Run `git status --ignored` to verify `.env.production` and `.env.local` are strictly ignored.
- [ ] Verify that neither `.env.example` nor `.env.production.example` contains actual keys or production passwords.
- [ ] Confirm `LIVENESS_PROVIDER` is set to a certified biometric provider (`AWS_REKOGNITION`, `HYPERVERGE`, or `VERIFF`), not `mock`.
- [ ] Confirm all signing secrets (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET`, `STORAGE_SIGNING_SECRET`) are at least 32 characters long.
- [ ] Test frontend production build with `NEXT_PUBLIC_APP_ENV=production`.
