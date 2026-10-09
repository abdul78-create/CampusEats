import { PrismaClient } from '@prisma/client';
import { IAuditLogRepository, AppendAuditLogInput } from '../domain/IAuditLogRepository.js';
import { AuditLogEntryProps, VerificationReport, GENESIS_HASH } from '../domain/AuditInterfaces.js';
import { AuditActionType } from '../domain/AuditEnums.js';
import { Sha256HashChainService } from '../domain/Sha256HashChainService.js';

export class PrismaAuditLogRepository implements IAuditLogRepository {
  private readonly hashService = new Sha256HashChainService();

  constructor(private readonly prisma: PrismaClient) {}

  async append(entry: AppendAuditLogInput): Promise<AuditLogEntryProps> {
    const maxRetries = 5;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Monotonically assign sequence number and chain from previous hash
        const latest = await this.getLatestEntry();
        const nextSeq = latest ? latest.sequenceNumber + 1n : 1n;
        const prevHash = latest ? latest.currentHash : GENESIS_HASH;

        const { currentHash, timestamp } = this.hashService.createEntry({
          sequenceNumber: nextSeq,
          previousHash: prevHash,
          actorId: entry.actorId,
          actionType: entry.actionType,
          targetEntity: entry.targetEntity,
          targetId: entry.targetId,
          previousValue: entry.previousValue,
          newValue: entry.newValue,
          reason: entry.reason,
          sessionReference: entry.sessionReference,
          timestamp: entry.timestamp,
        });

        const raw = await this.prisma.auditLog.create({
          data: {
            sequenceNumber: nextSeq,
            actorId: entry.actorId || null,
            actionType: entry.actionType as any,
            targetEntity: entry.targetEntity,
            targetId: entry.targetId,
            previousValue: entry.previousValue ? (entry.previousValue as any) : undefined,
            newValue: entry.newValue ? (entry.newValue as any) : undefined,
            reason: entry.reason || null,
            sessionReference: entry.sessionReference || null,
            timestamp,
            previousHash: prevHash,
            currentHash,
          },
        });

        return {
          id: raw.id,
          sequenceNumber: raw.sequenceNumber,
          actorId: raw.actorId,
          actionType: raw.actionType as AuditActionType,
          targetEntity: raw.targetEntity,
          targetId: raw.targetId,
          previousValue: raw.previousValue as any,
          newValue: raw.newValue as any,
          reason: raw.reason,
          sessionReference: raw.sessionReference,
          timestamp: raw.timestamp,
          previousHash: raw.previousHash,
          currentHash: raw.currentHash,
        };
      } catch (error: any) {
        if (error.code === 'P2002' && attempt < maxRetries - 1) {
          // Concurrency sequenceNumber collision - brief backoff and retry
          await new Promise(res => setTimeout(res, 20 * (attempt + 1)));
          continue;
        }
        throw error;
      }
    }
    throw new Error('Failed to append audit log after maximum retries');
  }

  async findAll(limit = 100): Promise<AuditLogEntryProps[]> {
    const raws = await this.prisma.auditLog.findMany({
      orderBy: { sequenceNumber: 'asc' },
      take: limit,
    });

    return raws.map(r => ({
      id: r.id,
      sequenceNumber: r.sequenceNumber,
      actorId: r.actorId,
      actionType: r.actionType as AuditActionType,
      targetEntity: r.targetEntity,
      targetId: r.targetId,
      previousValue: r.previousValue as any,
      newValue: r.newValue as any,
      reason: r.reason,
      sessionReference: r.sessionReference,
      timestamp: r.timestamp,
      previousHash: r.previousHash,
      currentHash: r.currentHash,
    }));
  }

  async getLatestEntry(): Promise<AuditLogEntryProps | null> {
    const raw = await this.prisma.auditLog.findFirst({
      orderBy: { sequenceNumber: 'desc' },
    });
    if (!raw) return null;

    return {
      id: raw.id,
      sequenceNumber: raw.sequenceNumber,
      actorId: raw.actorId,
      actionType: raw.actionType as AuditActionType,
      targetEntity: raw.targetEntity,
      targetId: raw.targetId,
      previousValue: raw.previousValue as any,
      newValue: raw.newValue as any,
      reason: raw.reason,
      sessionReference: raw.sessionReference,
      timestamp: raw.timestamp,
      previousHash: raw.previousHash,
      currentHash: raw.currentHash,
    };
  }

  async verifyChain(): Promise<VerificationReport> {
    const all = await this.findAll(10000);
    return this.hashService.verifyIntegrity(all);
  }
}
