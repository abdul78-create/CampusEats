import { HashChainUtil } from '../../../shared/security/HashChainUtil.js';
import { 
  AuditLogEntryProps, 
  VerificationReport, 
  GENESIS_HASH 
} from './AuditInterfaces.js';

export class Sha256HashChainService {
  /**
   * Generates a new cryptographically chained audit entry.
   */
  public createEntry(params: {
    sequenceNumber: bigint;
    previousHash: string;
    actorId?: string | null;
    actionType: string;
    targetEntity: string;
    targetId: string;
    previousValue?: unknown;
    newValue?: unknown;
    reason?: string | null;
    sessionReference?: string | null;
    timestamp?: Date;
  }): { currentHash: string; timestamp: Date } {
    const timestamp = params.timestamp || new Date();

    const currentHash = HashChainUtil.calculateAuditHash({
      sequenceNumber: params.sequenceNumber,
      previousHash: params.previousHash,
      actorId: params.actorId || null,
      actionType: params.actionType,
      targetEntity: params.targetEntity,
      targetId: params.targetId,
      previousValue: params.previousValue,
      newValue: params.newValue,
      timestamp,
    });

    return {
      currentHash,
      timestamp,
    };
  }

  /**
   * Verifies full sequential cryptographic continuity of an audit trail.
   */
  public verifyIntegrity(records: AuditLogEntryProps[]): VerificationReport {
    if (records.length === 0) {
      return {
        isValid: true,
        totalRecordsChecked: 0,
      };
    }

    let expectedPrevHash = GENESIS_HASH;
    let expectedSequence = 1n;

    for (let i = 0; i < records.length; i++) {
      const entry = records[i];

      // 1. Check sequence number monotonicity
      if (entry.sequenceNumber !== expectedSequence) {
        return {
          isValid: false,
          totalRecordsChecked: i,
          brokenSequenceNumber: entry.sequenceNumber,
          errorDetails: `Non-sequential sequence number detected. Expected ${expectedSequence}, found ${entry.sequenceNumber}`,
        };
      }

      // 2. Check previous hash continuity
      if (entry.previousHash !== expectedPrevHash) {
        return {
          isValid: false,
          totalRecordsChecked: i,
          brokenSequenceNumber: entry.sequenceNumber,
          expectedHash: expectedPrevHash,
          actualHash: entry.previousHash,
          errorDetails: `Broken hash link at sequence ${entry.sequenceNumber}. Previous hash mismatch.`,
        };
      }

      // 3. Recompute hash from content
      const computedHash = HashChainUtil.calculateAuditHash({
        sequenceNumber: entry.sequenceNumber,
        previousHash: entry.previousHash,
        actorId: entry.actorId || null,
        actionType: entry.actionType,
        targetEntity: entry.targetEntity,
        targetId: entry.targetId,
        previousValue: entry.previousValue,
        newValue: entry.newValue,
        timestamp: entry.timestamp,
      });

      if (computedHash !== entry.currentHash) {
        return {
          isValid: false,
          totalRecordsChecked: i,
          brokenSequenceNumber: entry.sequenceNumber,
          expectedHash: computedHash,
          actualHash: entry.currentHash,
          errorDetails: `Tampered payload detected at sequence ${entry.sequenceNumber}. Hash digest does not match record data.`,
        };
      }

      expectedPrevHash = entry.currentHash;
      expectedSequence += 1n;
    }

    return {
      isValid: true,
      totalRecordsChecked: records.length,
    };
  }
}
