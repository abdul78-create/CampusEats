import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { NotFoundError } from '../../../shared/errors/DomainErrors.js';

export class StallController {
  constructor(private readonly prisma: PrismaClient) {}

  public getStalls = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stalls = await this.prisma.stall.findMany({
        where: { isApproved: true, deletedAt: null },
        include: {
          capacity: true,
          operatingHours: true,
        },
      });

      res.status(200).json({
        success: true,
        data: stalls.map(s => ({
          id: s.id,
          name: s.name,
          campusBlock: s.campusBlock,
          description: s.description,
          liveStatus: s.liveStatus,
          processingMode: s.processingMode,
          capacity: s.capacity ? {
            maxActiveOrders: s.capacity.maxActiveOrders,
            parallelPreparationLimit: s.capacity.parallelPreparationLimit,
            operationalBufferMinutes: s.capacity.operationalBufferMinutes,
          } : null,
          operatingHours: s.operatingHours.map(h => ({
            dayOfWeek: h.dayOfWeek,
            openTime: h.openTime,
            closeTime: h.closeTime,
          })),
        })),
      });
    } catch (error) {
      next(error);
    }
  };

  public getStallById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const stall = await this.prisma.stall.findFirst({
        where: { id, isApproved: true, deletedAt: null },
        include: {
          capacity: true,
          operatingHours: true,
        },
      });

      if (!stall) {
        throw new NotFoundError('Stall could not be found');
      }

      res.status(200).json({
        success: true,
        data: {
          id: stall.id,
          name: stall.name,
          campusBlock: stall.campusBlock,
          description: stall.description,
          liveStatus: stall.liveStatus,
          processingMode: stall.processingMode,
          capacity: stall.capacity,
          operatingHours: stall.operatingHours,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  public getStallMenu = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const items = await this.prisma.menuItem.findMany({
        where: { stallId: id, deletedAt: null },
        include: {
          inventory: true,
        },
      });

      res.status(200).json({
        success: true,
        data: items.map(item => ({
          id: item.id,
          stallId: item.stallId,
          name: item.name,
          description: item.description,
          price: Number(item.price),
          category: item.category,
          isVegetarian: item.isVegetarian,
          preparationTimeMinutes: item.preparationTimeMinutes,
          availabilityState: item.availabilityState,
          availableQuantity: item.inventory?.availableQuantity ?? 0,
          isSoldOut: item.availabilityState === 'SOLD_OUT' || (item.inventory?.availableQuantity ?? 0) <= 0,
        })),
      });
    } catch (error) {
      next(error);
    }
  };
}
