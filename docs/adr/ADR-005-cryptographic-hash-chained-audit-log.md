# ADR-005: Cryptographically Hash-Chained Audit Log with SHA-256

## Status
Accepted

## Context
In a multi-tenant campus platform with financial reconciliations, refunds, stall approvals, and capacity overrides, administrative actions must have guaranteed, tamper-evident auditability. A compromised database credential or rogue administrator could otherwise delete or manipulate historical audit records to conceal fraud.

## Decision
We implement a **SHA-256 cryptographically hash-chained audit log**.
- Every audit record stores a monotonic `sequenceNumber`, `previousHash`, and `currentHash`.
- The genesis entry is anchored at sequence `0` with constant `GENESIS_HASH` (`64 zeros`).
- Each record's `currentHash` is computed as:
  $$\text{SHA256}(\text{sequenceNumber} + "|" + \text{previousHash} + "|" + \text{actorId} + "|" + \text{actionType} + "|" + \text{targetEntity} + "|" + \text{targetId} + "|" + \text{canonicalJson}(\text{payload}) + "|" + \text{timestamp})$$
- An automated verification service (`Sha256HashChainService`) scans the chain from genesis to head, verifying cryptographic continuity.
- This design is explicitly identified as an append-only cryptographic hash chain, **NOT a blockchain**.

## Consequences
### Positive
- Any out-of-band alteration, row deletion, or insertion breaks the chain immediately.
- High trust for campus administrators, food stall owners, and student union observers.
- Fast SHA-256 computation in Node.js native `crypto` module.

### Negative
- Concurrent writes to the audit log require sequential serialization (or queue-based sequence assignment) to avoid hash conflicts on identical sequence numbers.
