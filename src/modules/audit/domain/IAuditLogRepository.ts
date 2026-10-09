import { AuditLogEntryProps, VerificationReport } from './AuditInterfaces.js';

export type AppendAuditLogInput = Omit<AuditLogEntryProps, 'id' | 'sequenceNumber' | 'currentHash' | 'previousHash' | 'timestamp'> & {
  timestamp?: Date;
  previousHash?: string;
};

export interface IAuditLogRepository {
  append(entry: AppendAuditLogInput): Promise<AuditLogEntryProps>;
  findAll(limit?: number): Promise<AuditLogEntryProps[]>;
  getLatestEntry(): Promise<AuditLogEntryProps | null>;
  verifyChain(): Promise<VerificationReport>;
}
