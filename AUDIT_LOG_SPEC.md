# CampusEats — Cryptographically Hash-Chained Audit Log Specification

## 1. Integrity Philosophy & Definition

In a university food platform handling student payments, vendor payouts, stall capacity rules, and operational refunds, an administrative audit log must be **tamper-evident**. If a rogue administrator or compromised database account alters historical records, changes pricing, or fabricates refunds, the system must immediately detect the discrepancy.

> **CRITICAL ARCHITECTURAL CLASSIFICATION:**
> This system is **NOT a blockchain**. It does not use peer-to-peer consensus, proof-of-work, or distributed mining.
> It is an enterprise **SHA-256 cryptographically hash-chained audit log** (similar to Git commit trees or Certificate Transparency logs).
>
> **ENFORCEMENT LEVEL NOTE:**
> Immutability currently operates via **append-only application semantics with SHA-256 hash-chain integrity verification**.
> It relies on cryptographic hash-chaining where tampering with records, sequence numbers, or previous hashes is immediately detected during integrity verification. Operating-system and database-level role isolation (revoking UPDATE/DELETE from operational database credentials) is assigned to production infrastructure deployment (Phase 14).

---

## 2. Hash Chain Architecture & Mathematical Structure

Every audit event is cryptographically linked to the digest of the preceding event:

```
[ Genesis Block ]
Hash: 0000000000000000000000000000000000000000000000000000000000000000
       │
       ▼
[ Audit Record #1 ]
Seq: 1 | PrevHash: 0000...0000 | CurrentHash: e3b0c44298fc1c149afbf4c8996fb924...
       │
       ▼
[ Audit Record #2 ]
Seq: 2 | PrevHash: e3b0c442...  | CurrentHash: 7f83b1657ff1fc53b92dc18148a1d65d...
       │
       ▼
[ Audit Record #3 ]
Seq: 3 | PrevHash: 7f83b165...  | CurrentHash: 5e884898da28047151d0e56f8dc62927...
```

If any attacker tampers with Record #2 (e.g. changing an approved refund amount), `CurrentHash` for Record #2 no longer matches its content, and Record #3's `PrevHash` becomes invalid, breaking the chain.

---

## 3. Record Schema & Hashing Formula

### 3.1 Schema Attributes
- `id`: UUIDv4.
- `sequenceNumber`: 64-bit integer, strictly monotonic (`1, 2, 3, ...`).
- `actorId`: User ID of the administrator, stall owner, or `SYSTEM`.
- `actionType`: Categorized `AuditActionType`.
- `targetEntity`: Target entity name (`"Stall"`, `"Refund"`, `"User"`, `"Capacity"`).
- `targetId`: Primary key of the modified entity.
- `previousValue`: Canonical JSON snapshot before mutation.
- `newValue`: Canonical JSON snapshot after mutation.
- `reason`: Justification text provided by actor.
- `timestamp`: UTC ISO 8601 string.
- `sessionReference`: IP address, session token hash, or correlation ID.
- `previousHash`: Hex-encoded SHA-256 digest of record with `sequenceNumber - 1`.
- `currentHash`: Hex-encoded SHA-256 digest of current payload.

### 3.2 Canonical Hashing Algorithm
To prevent non-deterministic JSON key serialization issues, all object fields are sorted alphabetically before string concatenation:

$$\text{payloadString} = \text{sequenceNumber} + "|" + \text{previousHash} + "|" + \text{actorId} + "|" + \text{actionType} + "|" + \text{targetEntity} + "|" + \text{targetId} + "|" + \text{canonicalJson}(\text{previousValue}) + "|" + \text{canonicalJson}(\text{newValue}) + "|" + \text{timestamp}$$

$$\text{currentHash} = \text{SHA256}(\text{payloadString})$$

---

## 4. Genesis Block Definition

The chain begins at sequence `0` with the hard-coded Genesis Constant:
```typescript
export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';
```

---

## 5. Audit Chain Verification Service

The backend provides a verification service (`Sha256HashChainService.verifyIntegrity()`) accessible via admin API (`POST /api/v1/audit/verify-chain`):

```typescript
export interface VerificationReport {
  isValid: boolean;
  totalRecordsChecked: number;
  brokenSequenceNumber?: bigint;
  expectedHash?: string;
  actualHash?: string;
  errorDetails?: string;
}
```

The service traverses every record in ascending order from `sequenceNumber = 1` to head:
1. Verifies that `record[i].previousHash === record[i-1].currentHash`.
2. Recomputes `SHA256(record[i])` and asserts equality with `record[i].currentHash`.
3. Asserts that `record[i].sequenceNumber === record[i-1].sequenceNumber + 1n`.

Any mismatch halts verification, flags the exact corrupted sequence number, and notifies system administrators.
