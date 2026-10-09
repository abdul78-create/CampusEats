-- Phase 7 audit event correction: add LIVENESS_EVIDENCE_ACCESSED as a distinct
-- audit event type so biometric liveness evidence access is permanently separable
-- from identity document access (STUDENT_DOCUMENT_ACCESSED) in the audit trail.
ALTER TYPE "AuditActionType" ADD VALUE IF NOT EXISTS 'LIVENESS_EVIDENCE_ACCESSED';
