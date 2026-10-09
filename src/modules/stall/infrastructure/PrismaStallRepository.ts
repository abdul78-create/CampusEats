import { PrismaClient } from '@prisma/client';
import { IStallRepository } from '../domain/IStallRepository.js';
import { StallAggregate } from '../domain/StallAggregate.js';
import { StallStatus, OrderProcessingMode } from '../domain/StallEnums.js';

export class PrismaStallRepository implements IStallRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<StallAggregate | null> {
    const raw = await this.prisma.stall.findUnique({
      where: { id },
      include: {
        capacity: true,
        operatingHours: true,
      },
    });
    if (!raw) return null;

    return this.mapToDomain(raw);
  }

  async findByOwnerId(ownerId: string): Promise<StallAggregate[]>{
    const raws = await this.prisma.stall.findMany({
      where: { ownerId },
      include: {
        capacity: true,
        operatingHours: true,
      },
    });

    return raws.map(r => this.mapToDomain(r));
  }

  async findAllApproved(): Promise<StallAggregate[]> {
    const raws = await this.prisma.stall.findMany({
      where: { isApproved: true },
      include: {
        capacity: true,
        operatingHours: true,
      },
    });

    return raws.map(r => this.mapToDomain(r));
  }

  async save(stall: StallAggregate): Promise<void> {
    const { id: _capId, stallId: _stallId, ...capacityData } = stall.capacity;

    await this.prisma.stall.upsert({
      where: { id: stall.id },
      create: {
        id: stall.id,
        ownerId: stall.ownerId,
        name: stall.name,
        campusBlock: stall.campusBlock,
        liveStatus: stall.liveStatus,
        processingMode: stall.processingMode,
        isApproved: stall.isApproved,
        capacity: {
          create: capacityData,
        },
      },
      update: {
        name: stall.name,
        campusBlock: stall.campusBlock,
        liveStatus: stall.liveStatus,
        processingMode: stall.processingMode,
        isApproved: stall.isApproved,
        capacity: {
          upsert: {
            create: capacityData,
            update: {
              maxActiveOrders: stall.capacity.maxActiveOrders,
              maxOrdersPerWindow: stall.capacity.maxOrdersPerWindow,
              parallelPreparationLimit: stall.capacity.parallelPreparationLimit,
              operationalBufferMinutes: stall.capacity.operationalBufferMinutes,
            },
          },
        },
      },
    });

    for (const h of stall.operatingHours) {
      await this.prisma.stallOperatingHour.upsert({
        where: {
          stallId_dayOfWeek: {
            stallId: stall.id,
            dayOfWeek: h.dayOfWeek,
          },
        },
        create: {
          id: h.id,
          stallId: stall.id,
          dayOfWeek: h.dayOfWeek,
          openTime: h.openTime,
          closeTime: h.closeTime,
          isClosed: h.isClosed,
        },
        update: {
          openTime: h.openTime,
          closeTime: h.closeTime,
          isClosed: h.isClosed,
        },
      });
    }
  }

  private mapToDomain(raw: any): StallAggregate {
    return new StallAggregate({
      id: raw.id,
      ownerId: raw.ownerId,
      name: raw.name,
      campusBlock: raw.campusBlock,
      description: raw.description,
      imageUrl: raw.imageUrl,
      liveStatus: raw.liveStatus as StallStatus,
      processingMode: raw.processingMode as OrderProcessingMode,
      isApproved: raw.isApproved,
      capacity: raw.capacity ? {
        id: raw.capacity.id,
        stallId: raw.capacity.stallId,
        maxActiveOrders: raw.capacity.maxActiveOrders,
        maxOrdersPerWindow: raw.capacity.maxOrdersPerWindow,
        windowDurationMinutes: raw.capacity.windowDurationMinutes,
        maxOrdersPerPickupInterval: raw.capacity.maxOrdersPerPickupInterval,
        pickupIntervalMinutes: raw.capacity.pickupIntervalMinutes,
        parallelPreparationLimit: raw.capacity.parallelPreparationLimit,
        operationalBufferMinutes: raw.capacity.operationalBufferMinutes,
        pickupGracePeriodMinutes: raw.capacity.pickupGracePeriodMinutes,
      } : null,
      operatingHours: (raw.operatingHours || []).map((h: any) => ({
        id: h.id,
        stallId: h.stallId,
        dayOfWeek: h.dayOfWeek,
        openTime: h.openTime,
        closeTime: h.closeTime,
        isClosed: h.isClosed,
      })),
    });
  }
}
