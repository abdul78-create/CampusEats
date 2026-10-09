import { PrismaClient } from '@prisma/client';
import { IIdempotencyRepository, IdempotencyRecordProps } from './IIdempotencyRepository.js';

export class PrismaIdempotencyRepository implements IIdempotencyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async find(key: string): Promise<IdempotencyRecordProps | null> {
    const raw = await this.prisma.idempotencyRecord.findUnique({
      where: { key },
    });
    if (!raw) return null;

    return {
      key: raw.key,
      targetAction: raw.targetAction,
      requestHash: raw.requestHash,
      responsePayload: raw.responsePayload,
      statusCode: raw.statusCode,
      isCompleted: raw.isCompleted,
      expiresAt: raw.expiresAt,
      createdAt: raw.createdAt,
    };
  }

  async save(record: IdempotencyRecordProps): Promise<void> {
    await this.prisma.idempotencyRecord.create({
      data: {
        key: record.key,
        targetAction: record.targetAction,
        requestHash: record.requestHash,
        responsePayload: record.responsePayload as any,
        statusCode: record.statusCode,
        isCompleted: record.isCompleted,
        expiresAt: record.expiresAt,
      },
    });
  }

  async complete(key: string, responsePayload: unknown, statusCode: number, requestHash?: string): Promise<void> {
    await this.prisma.idempotencyRecord.upsert({
      where: { key },
      create: {
        key,
        targetAction: 'ORDER_CHECKOUT',
        requestHash: requestHash || key,
        isCompleted: true,
        responsePayload: responsePayload as any,
        statusCode,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      update: {
        isCompleted: true,
        requestHash: requestHash || key,
        responsePayload: responsePayload as any,
        statusCode,
      },
    });
  }

  async delete(key: string): Promise<void> {
    await this.prisma.idempotencyRecord.deleteMany({
      where: { key },
    });
  }
}
