/**
 * CampusEats — Phase F6 Admin Portal Types
 * Authoritative contracts matching Identity, Verification, Audit, and Operations modules.
 */

export type VerificationStatus =
  | "PENDING_SUBMISSION"
  | "UNDER_REVIEW"
  | "ACTIVE"
  | "REJECTED"
  | "SUSPENDED";

export type VerificationRejectionReason =
  | "INVALID_DOCUMENT"
  | "DOCUMENT_UNREADABLE"
  | "IDENTITY_MISMATCH"
  | "EXPIRED_DOCUMENT"
  | "POOR_QUALITY"
  | "SUSPECTED_FRAUD";

export interface AdminDocumentMetadata {
  id: string;
  documentType: string;
  originalFilename: string;
  fileMimeType: string;
  fileSizeBytes: number;
  createdAt: string;
}

export interface AdminVerificationItem {
  id: string; // verificationId
  studentProfileId: string;
  studentName: string;
  universityRegNumber: string;
  email: string;
  phoneNumber: string;
  status: VerificationStatus;
  rejectionReasonCode?: VerificationRejectionReason | null;
  rejectionReason?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  document?: AdminDocumentMetadata | null;
}

export interface AdminVerificationQueueResponse {
  data: AdminVerificationItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminDocumentUrlResponse {
  url: string;
  expiresInSeconds: number;
}

export interface AdminLivenessSessionSummary {
  id: string;
  status: string;
  confidenceScore: number;
  decision: string;
  createdAt: string;
}

export interface AdminLivenessDetails {
  verificationId: string;
  providerName: string;
  isLiveHuman: boolean;
  naturalBlinkPassed: boolean;
  headTurnLeftPassed: boolean;
  headTurnRightPassed: boolean;
  confidenceScore: number;
  consecutiveFailures: number;
  lastFailureAt?: string | null;
  lockedUntil?: string | null;
  verifiedAt?: string | null;
  signedEvidenceUrl?: string | null;
  recentSessions: AdminLivenessSessionSummary[];
}

export interface AuditLogRecord {
  id: string;
  sequenceNumber: string;
  actorId: string;
  actionType: string;
  targetEntity: string;
  targetId: string;
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  reason?: string | null;
  timestamp: string;
  previousHash: string;
  currentHash: string;
}

export interface AuditLogsResponse {
  data: AuditLogRecord[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AuditChainVerificationResult {
  isValid: boolean;
  totalRecordsChecked: number;
  brokenSequenceNumber?: string;
  errorDetails?: string;
}

export interface AdminOperatingHourItem {
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  openTime: string; // HH:MM
  closeTime: string; // HH:MM
}

export interface StallOperatingHoursInput {
  stallId: string;
  hours: AdminOperatingHourItem[];
}

export interface AdminRefundResponse {
  refundId: string;
  subOrderId: string;
  refundAmount: number;
  status: string;
}
