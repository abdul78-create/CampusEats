# CampusEats — Identity & Liveness Verification Specification

## 1. Principles & Non-Integration Reality

1. **No University ERP Coupling**: CampusEats does not assume or require direct integration with university LDAP, Active Directory, or student information systems.
2. **Self-Contained Verification**: Verification is performed directly within CampusEats via student document inspection and liveness challenge analysis.
3. **Strict Verification Gate**: An unverified account (`PENDING_VERIFICATION`, `SUSPENDED`, `REJECTED`) is **strictly barred from creating orders or joining queues**.

---

## 2. Student Account Lifecycle

```
[ Registration Completed ]
             │
             ▼
  [ PENDING_VERIFICATION ] ──► (Violations / Fake ID) ──► [ REJECTED ]
             │
             │ Documents Uploaded + Liveness Passed + Admin/Auto Approved
             ▼
        [ ACTIVE ]
             │
             ├─► (Disciplinary Action / Fraud) ──► [ SUSPENDED ]
             │
             └─► (Allowed to Order & Schedule Pickups)
```

---

## 3. Required Student Verification Data

Every student profile requires:
1. `fullName`: Legal full name matching campus identity.
2. `phoneNumber`: Verified mobile number (E.164 standard).
3. `email`: Academic or personal email address.
4. `universityRegNumber`: Official university student roll/registration number (unique constraint).
5. `idCardImage`: High-resolution photograph of the official university student ID card.
6. `profilePhoto`: Clear facial portrait used for counter pickup verification.
7. `livenessVerification`: Interactive anti-spoofing challenge verification session.

---

## 4. Liveness Verification Provider Abstraction

To ensure anti-spoofing verification is modular and swappable between local development, testing, and production, CampusEats uses an explicit provider interface.

### 4.1 Interface Contract
```typescript
export interface LivenessChallengeSession {
  sessionId: string;
  studentId: string;
  challenges: LivenessChallengeType[];
  expiresAt: Date;
}

export interface LivenessVerificationResult {
  isVerified: boolean;
  confidenceScore: number;
  challengesCompleted: {
    naturalBlink: boolean;
    headTurnLeft: boolean;
    headTurnRight: boolean;
  };
  providerReference: string;
}

export interface LivenessVerificationProvider {
  createSession(studentId: string): Promise<LivenessChallengeSession>;
  evaluateChallenge(sessionId: string, challengeData: unknown): Promise<LivenessVerificationResult>;
}
```

### 4.2 Required Challenge Sequence
1. **Challenge 1: Natural Blink** — Verifies live ocular response.
2. **Challenge 2: Head Turn Left** — Verifies 3D facial movement and depth.
3. **Challenge 3: Head Turn Right** — Verifies lateral rotational symmetry.

### 4.3 Development vs. Production Disclaimer
> **CRITICAL TRANSPARENCY NOTICE ON LIVENESS:**
> The current development implementation provides **Device-side liveness verification** for simulating challenge sequences and automated testing workflows. 
> It **DOES NOT** provide production-grade biometric anti-spoofing.
> Production deployment requires plugging in a certified biometric provider (e.g. AWS Rekognition Face Liveness, Veriff, or HyperVerge) configured via environment variables.

---

## 5. Secure File Upload & Storage Pipeline

Student ID card documents and profile images contain sensitive PII. The storage pipeline adheres to strict security gates:

1. **Validation Gates**:
   - Magic bytes / MIME signature check (`image/jpeg`, `image/png`, `image/webp`). Client-sent extensions are never trusted.
   - Size limit: Max 5MB per image.
   - SHA-256 checksum calculated on byte stream before write.
2. **Storage Abstraction (`StorageProvider`)**:
   - Development: `LocalStorageProvider` writes to secured volume (`./storage/uploads`) excluded by `.gitignore`.
   - Production: Encrypted S3-compatible or Google Cloud Storage bucket with private ACLs and signed URLs.
3. **Data Isolation**: Uploaded identity documents are never committed to git repositories, never exposed publicly without authentication, and never accessible by food stall staff.

---

## 6. Pickup Verification & Data Minimization

When a student arrives at a food stall to pick up an order, counter staff must confirm identity without violating student privacy:

| Field | Exposed to Stall Counter Staff? | Masking Format |
| :--- | :--- | :--- |
| Student Full Name | Yes | Full Name |
| Profile Photograph | Yes | Visual check |
| Registration Number | Yes (Masked) | `2024••••9842` |
| Full University ID Card | **NO (STRICTLY FORBIDDEN)** | Hidden |
| Mobile Phone Number | **NO** | `+91 ••••• 3210` (Only last 4 digits) |
| Order ID & Items | Yes | Full details |
| Balance Due Amount | Yes | Amount in ₹ |
