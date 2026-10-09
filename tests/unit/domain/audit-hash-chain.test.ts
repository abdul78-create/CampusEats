import { Sha256HashChainService } from '../../../src/modules/audit/domain/Sha256HashChainService.js';
import { GENESIS_HASH, AuditLogEntryProps } from '../../../src/modules/audit/domain/AuditInterfaces.js';
import { AuditActionType } from '../../../src/modules/audit/domain/AuditEnums.js';

describe('Sha256HashChainService Cryptographic Audit Log', () => {
  const hashService = new Sha256HashChainService();

  test('generates valid genesis-anchored entry', () => {
    const entry = hashService.createEntry({
      sequenceNumber: 1n,
      previousHash: GENESIS_HASH,
      actorId: 'usr_admin_1',
      actionType: AuditActionType.STALL_CREATED,
      targetEntity: 'Stall',
      targetId: 'stl_dosa_corner',
      previousValue: null,
      newValue: { name: 'Dosa Corner', campusBlock: 'Block A' },
      reason: 'Approved onboarding',
    });

    expect(entry.currentHash).toHaveLength(64); // SHA-256 hex length
    expect(entry.currentHash).not.toEqual(GENESIS_HASH);
  });

  test('validates unbroken sequential audit chain', () => {
    const time1 = new Date('2026-09-24T10:00:00.000Z');
    const time2 = new Date('2026-09-24T10:05:00.000Z');

    const entry1 = hashService.createEntry({
      sequenceNumber: 1n,
      previousHash: GENESIS_HASH,
      actorId: 'usr_admin_1',
      actionType: AuditActionType.USER_VERIFIED,
      targetEntity: 'StudentProfile',
      targetId: 'std_profile_1',
      timestamp: time1,
    });

    const entry2 = hashService.createEntry({
      sequenceNumber: 2n,
      previousHash: entry1.currentHash,
      actorId: 'usr_owner_1',
      actionType: AuditActionType.STALL_STATUS_OVERRIDE,
      targetEntity: 'Stall',
      targetId: 'stl_1',
      timestamp: time2,
    });

    const chain: AuditLogEntryProps[] = [
      {
        id: 'log_1',
        sequenceNumber: 1n,
        actorId: 'usr_admin_1',
        actionType: AuditActionType.USER_VERIFIED,
        targetEntity: 'StudentProfile',
        targetId: 'std_profile_1',
        timestamp: time1,
        previousHash: GENESIS_HASH,
        currentHash: entry1.currentHash,
      },
      {
        id: 'log_2',
        sequenceNumber: 2n,
        actorId: 'usr_owner_1',
        actionType: AuditActionType.STALL_STATUS_OVERRIDE,
        targetEntity: 'Stall',
        targetId: 'stl_1',
        timestamp: time2,
        previousHash: entry1.currentHash,
        currentHash: entry2.currentHash,
      },
    ];

    const report = hashService.verifyIntegrity(chain);
    expect(report.isValid).toBe(true);
    expect(report.totalRecordsChecked).toBe(2);
  });

  test('detects tampered payload in historical record', () => {
    const time1 = new Date('2026-09-24T10:00:00.000Z');

    const entry1 = hashService.createEntry({
      sequenceNumber: 1n,
      previousHash: GENESIS_HASH,
      actorId: 'usr_admin_1',
      actionType: AuditActionType.ADMIN_REFUND_PROCESSED,
      targetEntity: 'Refund',
      targetId: 'ref_1',
      newValue: { refundAmount: 50.00 },
      timestamp: time1,
    });

    // An attacker alters newValue to 500.00 without updating hash
    const tamperedChain: AuditLogEntryProps[] = [
      {
        id: 'log_1',
        sequenceNumber: 1n,
        actorId: 'usr_admin_1',
        actionType: AuditActionType.ADMIN_REFUND_PROCESSED,
        targetEntity: 'Refund',
        targetId: 'ref_1',
        newValue: { refundAmount: 500.00 }, // TAMPERED!
        timestamp: time1,
        previousHash: GENESIS_HASH,
        currentHash: entry1.currentHash,
      },
    ];

    const report = hashService.verifyIntegrity(tamperedChain);
    expect(report.isValid).toBe(false);
    expect(report.brokenSequenceNumber).toBe(1n);
    expect(report.errorDetails).toContain('Tampered payload detected');
  });

  test('detects modified previousHash breaking verification', () => {
    const time1 = new Date('2026-09-24T10:00:00.000Z');
    const time2 = new Date('2026-09-24T10:05:00.000Z');

    const entry1 = hashService.createEntry({
      sequenceNumber: 1n,
      previousHash: GENESIS_HASH,
      actorId: 'usr_admin_1',
      actionType: AuditActionType.STALL_CREATED,
      targetEntity: 'Stall',
      targetId: 'stl_1',
      timestamp: time1,
    });

    const entry2 = hashService.createEntry({
      sequenceNumber: 2n,
      previousHash: entry1.currentHash,
      actorId: 'usr_owner_1',
      actionType: AuditActionType.STALL_STATUS_OVERRIDE,
      targetEntity: 'Stall',
      targetId: 'stl_1',
      timestamp: time2,
    });

    const brokenChain: AuditLogEntryProps[] = [
      {
        id: 'log_1',
        sequenceNumber: 1n,
        actorId: 'usr_admin_1',
        actionType: AuditActionType.STALL_CREATED,
        targetEntity: 'Stall',
        targetId: 'stl_1',
        timestamp: time1,
        previousHash: GENESIS_HASH,
        currentHash: entry1.currentHash,
      },
      {
        id: 'log_2',
        sequenceNumber: 2n,
        actorId: 'usr_owner_1',
        actionType: AuditActionType.STALL_STATUS_OVERRIDE,
        targetEntity: 'Stall',
        targetId: 'stl_1',
        timestamp: time2,
        previousHash: 'f'.repeat(64), // TAMPERED PREVIOUS HASH!
        currentHash: entry2.currentHash,
      },
    ];

    const report = hashService.verifyIntegrity(brokenChain);
    expect(report.isValid).toBe(false);
    expect(report.brokenSequenceNumber).toBe(2n);
    expect(report.errorDetails).toContain('Previous hash mismatch');
  });

  test('detects deleted or reordered records (broken sequence gap)', () => {
    const time1 = new Date('2026-09-24T10:00:00.000Z');
    const time3 = new Date('2026-09-24T10:10:00.000Z');

    const entry1 = hashService.createEntry({
      sequenceNumber: 1n,
      previousHash: GENESIS_HASH,
      actorId: 'usr_admin_1',
      actionType: AuditActionType.STALL_CREATED,
      targetEntity: 'Stall',
      targetId: 'stl_1',
      timestamp: time1,
    });

    const gappedChain: AuditLogEntryProps[] = [
      {
        id: 'log_1',
        sequenceNumber: 1n,
        actorId: 'usr_admin_1',
        actionType: AuditActionType.STALL_CREATED,
        targetEntity: 'Stall',
        targetId: 'stl_1',
        timestamp: time1,
        previousHash: GENESIS_HASH,
        currentHash: entry1.currentHash,
      },
      {
        id: 'log_3',
        sequenceNumber: 3n, // SEQUENCE GAP (RECORD 2 DELETED)!
        actorId: 'usr_owner_1',
        actionType: AuditActionType.STALL_STATUS_OVERRIDE,
        targetEntity: 'Stall',
        targetId: 'stl_1',
        timestamp: time3,
        previousHash: entry1.currentHash,
        currentHash: 'dummy_hash',
      },
    ];

    const report = hashService.verifyIntegrity(gappedChain);
    expect(report.isValid).toBe(false);
    expect(report.brokenSequenceNumber).toBe(3n);
    expect(report.errorDetails).toContain('Non-sequential sequence number detected');
  });
});
