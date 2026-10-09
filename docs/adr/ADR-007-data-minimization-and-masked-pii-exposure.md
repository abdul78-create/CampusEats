# ADR-007: Data Minimization and Masked PII Exposure

## Status
Accepted

## Context
Food stall counters employ ordinary campus stall workers. Exposing full student ID card scans, unmasked registration numbers, personal phone numbers, or private UPI IDs to counter staff creates significant privacy risks, harassment opportunities, and student safety concerns.

## Decision
We enforce strict **Data Minimization** at the architectural boundary:
1. **Pickup Verification View**: Counter staff are presented only with:
   - Student Full Name.
   - Profile Photograph (for visual face-matching).
   - Masked Registration Number (e.g., `2024••••9842`).
   - Order Items, SubOrder ID, and Balance Due.
2. **Strict Invariant**: Full student ID card photographs and raw registration numbers are never exposed to food stall staff or included in stall queue payloads.
3. **Masking Utility (`MaskingUtil`)**: Standardizes sanitization for phone numbers (`+91 ••••• 3210`) and UPI handles (`st•••@okaxis`).
4. **Access Auditing**: Any administrative view of unmasked student identity documents is recorded in the cryptographically chained audit log.

## Consequences
### Positive
- Robust compliance with campus data protection and student privacy expectations.
- Counter staff have exactly the data needed to hand over orders safely without excess PII exposure.

### Negative
- Requires careful DTO projection and automated unit tests to ensure unmasked fields are never accidentally serialized into public or stall endpoints.
