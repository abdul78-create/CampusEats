import { AuditActionType } from './AuditEnums.js';

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

export interface AuditLogEntryProps {
  id: string;
  sequenceNumber: bigint;
  actorId?: string | null;
  actionType: AuditActionType;
  targetEntity: string;
  targetId: string;
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  reason?: string | null;
  sessionReference?: string | null;
  timestamp: Date;
  previousHash: string;
  currentHash: string;
}

export interface VerificationReport {
  isValid: boolean;
  totalRecordsChecked: number;
  brokenSequenceNumber?: bigint;
  expectedHash?: string;
  actualHash?: string;
  errorDetails?: string;
}
