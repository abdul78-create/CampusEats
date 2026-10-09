# CampusEats — Object Storage Production Setup & Security Specification

## 1. Executive Summary

CampusEats manages two highly sensitive categories of student verification assets:
1. **University Identity Documents** (Student ID cards, government photo IDs).
2. **Biometric Liveness Evidence** (Temporal video streams submitted during interactive challenge sessions).

In accordance with strict security standards:
* **Zero raw bytes in SQL**: PostgreSQL stores only immutable cryptographic hashes (SHA-256), server-generated file metadata, and storage object keys.
* **Zero public HTTP endpoints**: The object storage bucket blocks 100% of public access.
* **Zero raw path leakage**: Frontend clients never receive internal filesystem paths, bucket names, or cloud object keys.
* **Short-lived cryptographic access**: Asset access is gated behind HMAC-SHA256 signed URLs with a strict 300-second (5-minute) expiration.

---

## 2. Storage Architecture & Privacy Boundaries

```
[Student / Admin Client]
         │
         │ 1. Multipart Upload (PDF / WebM / MP4)
         ▼
 ┌───────────────┐  2. Magic Byte & Antivirus Inspection  ┌─────────────────────────┐
 │   CampusEats  ├───────────────────────────────────────►│ Private Storage Bucket │
 │   API Server  │                                        │ (AWS S3 / GCP Storage)  │
 └───────┬───────┘  3. Server-Generated UUID Key          └─────────────────────────┘
         │          (e.g., id_doc_<uuid>.pdf)                         ▲
         │                                                            │
         │ 4. Persist Checksum + Metadata                             │
         ▼                                                            │
 ┌───────────────┐                                                    │
 │  PostgreSQL   │                                                    │
 └───────────────┘                                                    │
                                                                      │
 [Student / Admin Client]                                             │
         │                                                            │
         │ 5. GET /api/v1/.../url (BOLA / IDOR Authorization Check)   │
         ▼                                                            │
 ┌───────────────┐                                                    │
 │   CampusEats  │  6. Generates HMAC-SHA256 Signed URL (300s TTL)    │
 │   API Server  ├────────────────────────────────────────────────────┘
 └───────────────┘
```

---

## 3. The 12 Production Storage Invariants

### 3.1 Private Identity-Document Storage
* **Location**: Stored under prefix `documents/` or server-sanitized root.
* **Key Generation**: Unguessable UUID v4 format (`id_doc_${crypto.randomUUID()}.${ext}`). User-supplied filenames are never used as storage keys.
* **Ownership**: Tied strictly to `studentProfileId`. Only the verified student owner and authorized platform administrators can request signed URLs.
* **Audit Logging**: Every document access by an administrator records an immutable `STUDENT_DOCUMENT_ACCESSED` audit log entry with timestamp and admin actor ID.

### 3.2 Private Liveness-Evidence Storage
* **Location**: Stored under prefix `liveness/` (`liveness_${crypto.randomUUID()}.${ext}`).
* **Exact-Evidence Replay Prevention**: During video submission, `LivenessEvidenceValidator` computes a deterministic SHA-256 byte digest and verifies uniqueness against `LivenessEvidenceDigest`. If identical bytes are submitted across sessions, the submission is rejected immediately.
* **Access Control**: Students **never** receive download URLs for raw liveness video evidence. Only authorized platform administrators inspecting verifications receive signed URLs (`LivenessVerificationService:433`).
* **Audit Logging**: Every administrative evidence inspection records `LIVENESS_EVIDENCE_ACCESSED` in the hash chain.

### 3.3 S3 / GCS Provider Configuration
Configured via production environment variables:
```bash
STORAGE_PROVIDER=s3
STORAGE_BUCKET=campuseats-production-identity-documents
STORAGE_REGION=ap-south-1
STORAGE_ACCESS_KEY_ID=<IAM_ACCESS_KEY_ID>
STORAGE_SECRET_ACCESS_KEY=<IAM_SECRET_ACCESS_KEY>
STORAGE_SIGNING_SECRET=<32_CHAR_RANDOM_HEX_SECRET>
```

For Google Cloud Storage (GCS):
```bash
STORAGE_PROVIDER=gcs
STORAGE_BUCKET=campuseats-production-identity-documents
GOOGLE_APPLICATION_CREDENTIALS=/etc/secrets/gcp-sa-key.json
STORAGE_SIGNING_SECRET=<32_CHAR_RANDOM_HEX_SECRET>
```

### 3.4 Bucket-Level Public Access Blocking
Public access is blocked at the bucket and account level to prevent accidental data exposure:

* **AWS S3 Configuration**:
  ```bash
  aws s3api put-public-access-block \
    --bucket campuseats-production-identity-documents \
    --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
  ```
* **GCP Cloud Storage Configuration**:
  ```bash
  gcloud storage buckets update gs://campuseats-production-identity-documents \
    --uniform-bucket-level-access \
    --public-access-prevention
  ```

### 3.5 Encryption at Rest
* **AWS S3**: Server-Side Encryption with AWS Key Management Service (SSE-KMS) using a dedicated customer-managed key (CMK).
  * Enforced via bucket policy ([infra/storage/s3-bucket-policy.json](file:///c:/Users/Abdul/Desktop/Campus%20eats/infra/storage/s3-bucket-policy.json)) which explicitly denies unencrypted `PutObject` requests.
* **GCP Cloud Storage**: Customer-Managed Encryption Keys (CMEK) via Cloud KMS.
* **Local Volume Fallback**: Encrypted block device (dm-crypt / LUKS).

### 3.6 Least-Privilege IAM Policy
The application container identity (AWS IAM Role for Service Accounts or Task Role) requires only minimal object manipulation permissions:
* See: [infra/storage/iam-storage-policy.json](file:///c:/Users/Abdul/Desktop/Campus%20eats/infra/storage/iam-storage-policy.json)
* Allowed: `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket`.
* Prohibited: `s3:DeleteBucket`, `s3:PutBucketPolicy`, `s3:PutBucketAcl`, `s3:PutLifecycleConfiguration`.

### 3.7 Signed URL Expiration & Integrity
* **TTL**: Strict maximum validity of **300 seconds (5 minutes)**.
* **HMAC Signature**: Generated with HMAC-SHA256 using `STORAGE_SIGNING_SECRET`.
* **Timing-Safe Verification**: Signed URL download requests use `crypto.timingSafeEqual` to prevent timing attacks.
* **Replay & Expiration**: Expired timestamps (`Date.now() / 1000 > expires`) throw HTTP 403 Forbidden.

### 3.8 CORS Policy
* Direct browser fetches to signed URLs are restricted strictly to the verified production web frontend origin.
* See: [infra/storage/s3-cors-policy.json](file:///c:/Users/Abdul/Desktop/Campus%20eats/infra/storage/s3-cors-policy.json)
* Allowed Methods: `GET`, `HEAD`.
* Allowed Origins: `["https://campuseats.university.edu"]` (No wildcards in production).

### 3.9 Upload Size & Content-Type Restrictions

| Asset Type | Maximum File Size | Accepted MIME Types | Verification Method |
| :--- | :--- | :--- | :--- |
| **Identity Documents** | 5,242,880 bytes (5 MB) | `application/pdf`<br>`image/jpeg`<br>`image/png` | Authoritative magic bytes (`%PDF`, `\xFF\xD8\xFF`, `\x89\x50\x4E...`). Explicit rejection of Windows PE (`MZ`), Linux ELF, ZIP archives, and `<script` tags. |
| **Liveness Evidence** | 10,485,760 bytes (10 MB) | `video/webm`<br>`video/mp4` | EBML / ftyp container header verification. Static JPEG and PNG images are strictly rejected. |

### 3.10 Storage Failure Behavior & Compensating Cleanup
* **Fail-Closed Principle**: If object upload fails (network timeout, storage capacity exceeded, IAM denial), the transaction fails, the database record is NOT created, and an explicit error is returned.
* **Compensating Cleanup**: If the object is written to storage but the subsequent database transaction fails, `LivenessVerificationService` and `StudentVerificationService` invoke `storageProvider.deleteFile()` as a compensating action to eliminate orphaned storage objects (proven by `tests/integration/api-liveness-compensating-storage.test.ts`).

### 3.11 Local-Storage vs. Production-Provider Separation
* Both implementations adhere to the frozen interface `IStorageProvider` ([src/modules/identity/domain/StorageProvider.ts](file:///c:/Users/Abdul/Desktop/Campus%20eats/src/modules/identity/domain/StorageProvider.ts)).
* **Local Storage**: Used during testing and development. Storage directory `./storage/uploads` is excluded from Git via `.gitignore`.
* **Production Provider**: S3 or GCS adapter activated via `STORAGE_PROVIDER=s3`.

### 3.12 Verification: Zero Raw Object Path Exposure to Frontend
Audited application DTOs prove that raw storage paths never leak:
1. `StudentVerificationService.mapToStatusDto`:
   ```typescript
   document: {
     id: verif.identityDocument.id,
     documentType: verif.identityDocument.documentType,
     originalFilename: verif.identityDocument.originalFilename,
     fileMimeType: verif.identityDocument.fileMimeType,
     fileSizeBytes: verif.identityDocument.fileSizeBytes,
     createdAt: verif.identityDocument.createdAt,
     // fileStoragePath is EXCLUDED
   }
   ```
2. `LivenessVerificationService.getAdminLivenessRecord`:
   * Exposes only `signedEvidenceUrl`, explicitly omitting `evidenceStoragePath`.
3. Student URL Generation:
   * Returns `{ url: string, expiresInSeconds: 300 }`, directing the client to the authenticated download endpoint with signature token.

---

## 4. Production Storage Deployment Runbook

### Step 1: Create Dedicated KMS Key
```bash
aws kms create-key \
  --description "CampusEats Identity Documents Encryption Key" \
  --region ap-south-1
```

### Step 2: Provision S3 Bucket
```bash
aws s3api create-bucket \
  --bucket campuseats-production-identity-documents \
  --region ap-south-1 \
  --create-bucket-configuration LocationConstraint=ap-south-1
```

### Step 3: Enable Default KMS Encryption
```bash
aws s3api put-bucket-encryption \
  --bucket campuseats-production-identity-documents \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "aws:kms",
        "KMSMasterKeyId": "CAMPUS_EATS_STORAGE_KEY_ID"
      }
    }]
  }'
```

### Step 4: Block All Public Access
```bash
aws s3api put-public-access-block \
  --bucket campuseats-production-identity-documents \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
```

### Step 5: Apply Bucket Policies
```bash
# Bucket policy enforcing TLS and KMS
aws s3api put-bucket-policy \
  --bucket campuseats-production-identity-documents \
  --policy file://infra/storage/s3-bucket-policy.json

# CORS policy for campus domain
aws s3api put-bucket-cors \
  --bucket campuseats-production-identity-documents \
  --cors-configuration file://infra/storage/s3-cors-policy.json

# Lifecycle policy for cleanup and archiving
aws s3api put-bucket-lifecycle-configuration \
  --bucket campuseats-production-identity-documents \
  --lifecycle-configuration file://infra/storage/s3-lifecycle-policy.json
```

---

## 5. Storage Readiness Checklist

- [ ] S3/GCS bucket provisioned in correct production region.
- [ ] Block Public Access enabled (100% private).
- [ ] Server-side KMS encryption enforced on all PUT requests.
- [ ] IAM instance profile configured with least-privilege policy.
- [ ] `STORAGE_SIGNING_SECRET` generated with $\ge 32$ characters high-entropy hex string.
- [ ] CORS restricted to production frontend domain.
- [ ] Compensating storage cleanup verified in tests.
- [ ] Zero raw storage paths exposed in API responses verified.
