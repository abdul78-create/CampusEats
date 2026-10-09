import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { NotFoundError, ForbiddenError, ValidationError } from '../../../shared/errors/DomainErrors.js';
import { StallStatus } from '../domain/StallEnums.js';
import { IAuditLogRepository } from '../../audit/domain/IAuditLogRepository.js';
import { AuditActionType } from '../../audit/domain/AuditEnums.js';

export class OwnerStallController {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditRepo: IAuditLogRepository
  ) {}

  public getOwnerStall = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ownerId = req.user!.id;
      const stall = await this.prisma.stall.findFirst({
        where: { ownerId, deletedAt: null },
        include: {
          capacity: true,
          operatingHours: true,
          menuItems: {
            include: { inventory: true },
          },
        },
      });

      if (!stall) {
        throw new NotFoundError('No stall associated with this owner account');
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
          menuItems: stall.menuItems.map(item => ({
            id: item.id,
            name: item.name,
            price: Number(item.price),
            preparationTimeMinutes: item.preparationTimeMinutes,
            availableQuantity: item.inventory?.availableQuantity ?? 0,
            isSoldOut: (item.inventory?.availableQuantity ?? 0) <= 0,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  public updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ownerId = req.user!.id;
      const { status } = req.body;

      const stall = await this.prisma.stall.findFirst({
        where: { ownerId, deletedAt: null },
        include: { operatingHours: true },
      });

      if (!stall) {
        throw new NotFoundError('Stall not found');
      }

      // Check operating hours policy if transitioning to OPEN
      if (status === StallStatus.OPEN) {
        const now = new Date();
        const currentDay = now.getDay();
        const currentHour = now.getHours();
        const currentMin = now.getMinutes();
        const currentTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`;

        const todaySchedule = stall.operatingHours.find(h => h.dayOfWeek === currentDay);
        if (!todaySchedule || currentTimeStr < todaySchedule.openTime || currentTimeStr > todaySchedule.closeTime) {
          throw new ValidationError('Cannot open stall outside configured operating hours');
        }
      }

      const previousStatus = stall.liveStatus;
      await this.prisma.stall.update({
        where: { id: stall.id },
        data: { liveStatus: status },
      });

      // Audit log
      await this.auditRepo.append({
        actorId: ownerId,
        actionType: AuditActionType.STALL_STATUS_OVERRIDE,
        targetEntity: 'Stall',
        targetId: stall.id,
        previousValue: { liveStatus: previousStatus },
        newValue: { liveStatus: status },
        reason: 'Vendor updated operational status',
        sessionReference: req.id,
      });

      res.status(200).json({
        success: true,
        data: {
          stallId: stall.id,
          previousStatus,
          currentStatus: status,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  public updateInventory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ownerId = req.user!.id;
      const menuItemId = req.params.menuItemId as string;
      const { availableQuantity } = req.body;

      // Verify menu item belongs to owner's stall (BOLA Defense)
      const item = await this.prisma.menuItem.findUnique({
        where: { id: menuItemId },
        include: {
          stall: true,
          inventory: true,
        },
      });

      if (!item) {
        throw new NotFoundError('Menu item not found');
      }

      if (item.stall.ownerId !== ownerId && req.user!.role !== 'ADMIN') {
        throw new ForbiddenError('Unauthorized: You can only modify inventory for your own stall');
      }

      const previousQty = item.inventory?.availableQuantity ?? 0;
      const isSoldOut = availableQuantity === 0;

      await this.prisma.menuItemInventory.upsert({
        where: { menuItemId },
        create: {
          menuItemId,
          availableQuantity,
          reservedQuantity: 0,
        },
        update: {
          availableQuantity,
        },
      });

      await this.prisma.menuItem.update({
        where: { id: menuItemId },
        data: {
          availabilityState: isSoldOut ? 'SOLD_OUT' : 'AVAILABLE',
        },
      });

      await this.auditRepo.append({
        actorId: ownerId,
        actionType: AuditActionType.STALL_CAPACITY_OVERRIDE,
        targetEntity: 'MenuItemInventory',
        targetId: menuItemId,
        previousValue: { availableQuantity: previousQty },
        newValue: { availableQuantity, isSoldOut },
        reason: 'Vendor inventory stock adjustment',
        sessionReference: req.id,
      });

      res.status(200).json({
        success: true,
        data: {
          menuItemId,
          availableQuantity,
          isSoldOut,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  public getOwnerOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ownerId = req.user!.id;
      const stall = await this.prisma.stall.findFirst({
        where: { ownerId, deletedAt: null },
      });

      if (!stall) {
        throw new NotFoundError('Stall not found');
      }

      const subOrders = await this.prisma.subOrder.findMany({
        where: { stallId: stall.id },
        include: {
          items: true,
          pickupSchedule: true,
          masterOrder: {
            select: { orderNumber: true, studentId: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.status(200).json({
        success: true,
        data: subOrders.map(so => ({
          id: so.id,
          subOrderNumber: so.subOrderNumber,
          masterOrderNumber: so.masterOrder.orderNumber,
          status: so.status,
          totalAmount: Number(so.subtotalAmount),
          advancePaidAmount: Number(so.advancePaidAmount),
          remainingBalanceAmount: Number(so.balanceDueAmount),
          isBalancePaid: so.isBalancePaid,
          pickupSchedule: so.pickupSchedule ? {
            scheduledPickupTime: so.pickupSchedule.scheduledPickupTime,
            preparationTimeMinutes: so.pickupSchedule.preparationTimeMinutes,
          } : null,
          items: so.items.map(it => ({
            id: it.id,
            name: it.snapshotItemName,
            price: Number(it.snapshotPrice),
            quantity: it.quantity,
            total: Number(it.totalPrice),
          })),
        })),
      });
    } catch (error) {
      next(error);
    }
  };

  public getOwnerMenu = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ownerId = req.user!.id;
      const stall = await this.prisma.stall.findFirst({
        where: { ownerId, deletedAt: null },
      });

      if (!stall) {
        throw new NotFoundError('No stall associated with this owner account');
      }

      const items = await this.prisma.menuItem.findMany({
        where: { stallId: stall.id, deletedAt: null },
        include: { inventory: true },
        orderBy: { createdAt: 'asc' },
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

  public createMenuItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ownerId = req.user!.id;
      const stall = await this.prisma.stall.findFirst({
        where: { ownerId, deletedAt: null },
      });

      if (!stall) {
        throw new NotFoundError('No stall associated with this owner account');
      }

      const {
        name,
        description,
        price,
        category,
        isVegetarian = true,
        preparationTimeMinutes = 10,
        availableQuantity = 0,
      } = req.body;

      const created = await this.prisma.$transaction(async (tx) => {
        const item = await tx.menuItem.create({
          data: {
            stallId: stall.id,
            name,
            description,
            price,
            category,
            isVegetarian,
            preparationTimeMinutes,
            availabilityState: availableQuantity > 0 ? 'AVAILABLE' : 'AVAILABLE',
            inventory: {
              create: {
                availableQuantity,
                reservedQuantity: 0,
              },
            },
          },
          include: { inventory: true },
        });

        return item;
      });

      await this.auditRepo.append({
        actorId: ownerId,
        actionType: AuditActionType.STALL_CAPACITY_OVERRIDE,
        targetEntity: 'MenuItem',
        targetId: created.id,
        newValue: { name, price, category, preparationTimeMinutes, availableQuantity },
        reason: 'Vendor created new menu item',
        sessionReference: req.id,
      });

      res.status(201).json({
        success: true,
        data: {
          id: created.id,
          stallId: created.stallId,
          name: created.name,
          description: created.description,
          price: Number(created.price),
          category: created.category,
          isVegetarian: created.isVegetarian,
          preparationTimeMinutes: created.preparationTimeMinutes,
          availabilityState: created.availabilityState,
          availableQuantity: created.inventory?.availableQuantity ?? 0,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  public updateMenuItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ownerId = req.user!.id;
      const itemId = req.params.itemId as string;
      const updateData = req.body;

      const item = await this.prisma.menuItem.findFirst({
        where: { id: itemId, deletedAt: null },
        include: { stall: true, inventory: true },
      });

      if (!item) {
        throw new NotFoundError('Menu item not found');
      }

      // BOLA Defense: verify stall ownership
      if (item.stall.ownerId !== ownerId && req.user!.role !== 'ADMIN') {
        throw new ForbiddenError('Unauthorized: You can only modify menu items for your own stall');
      }

      const updated = await this.prisma.menuItem.update({
        where: { id: itemId },
        data: {
          ...(updateData.name !== undefined && { name: updateData.name }),
          ...(updateData.description !== undefined && { description: updateData.description }),
          ...(updateData.price !== undefined && { price: updateData.price }),
          ...(updateData.category !== undefined && { category: updateData.category }),
          ...(updateData.isVegetarian !== undefined && { isVegetarian: updateData.isVegetarian }),
          ...(updateData.preparationTimeMinutes !== undefined && { preparationTimeMinutes: updateData.preparationTimeMinutes }),
        },
        include: { inventory: true },
      });

      await this.auditRepo.append({
        actorId: ownerId,
        actionType: AuditActionType.STALL_CAPACITY_OVERRIDE,
        targetEntity: 'MenuItem',
        targetId: itemId,
        previousValue: {
          name: item.name,
          price: Number(item.price),
          preparationTimeMinutes: item.preparationTimeMinutes,
        },
        newValue: updateData,
        reason: 'Vendor updated menu item configuration',
        sessionReference: req.id,
      });

      res.status(200).json({
        success: true,
        data: {
          id: updated.id,
          stallId: updated.stallId,
          name: updated.name,
          description: updated.description,
          price: Number(updated.price),
          category: updated.category,
          isVegetarian: updated.isVegetarian,
          preparationTimeMinutes: updated.preparationTimeMinutes,
          availabilityState: updated.availabilityState,
          availableQuantity: updated.inventory?.availableQuantity ?? 0,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  public updateMenuItemAvailability = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ownerId = req.user!.id;
      const itemId = req.params.itemId as string;
      const { availabilityState } = req.body;

      const item = await this.prisma.menuItem.findFirst({
        where: { id: itemId, deletedAt: null },
        include: { stall: true, inventory: true },
      });

      if (!item) {
        throw new NotFoundError('Menu item not found');
      }

      // BOLA Defense: verify stall ownership
      if (item.stall.ownerId !== ownerId && req.user!.role !== 'ADMIN') {
        throw new ForbiddenError('Unauthorized: You can only modify menu items for your own stall');
      }

      const previousState = item.availabilityState;
      const updated = await this.prisma.menuItem.update({
        where: { id: itemId },
        data: { availabilityState },
        include: { inventory: true },
      });

      await this.auditRepo.append({
        actorId: ownerId,
        actionType: AuditActionType.STALL_CAPACITY_OVERRIDE,
        targetEntity: 'MenuItem',
        targetId: itemId,
        previousValue: { availabilityState: previousState },
        newValue: { availabilityState },
        reason: 'Vendor updated item availability status',
        sessionReference: req.id,
      });

      res.status(200).json({
        success: true,
        data: {
          id: updated.id,
          name: updated.name,
          availabilityState: updated.availabilityState,
          isSoldOut: updated.availabilityState === 'SOLD_OUT',
        },
      });
    } catch (error) {
      next(error);
    }
  };

  public deleteMenuItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ownerId = req.user!.id;
      const itemId = req.params.itemId as string;

      const item = await this.prisma.menuItem.findFirst({
        where: { id: itemId, deletedAt: null },
        include: { stall: true },
      });

      if (!item) {
        throw new NotFoundError('Menu item not found');
      }

      // BOLA Defense: verify stall ownership
      if (item.stall.ownerId !== ownerId && req.user!.role !== 'ADMIN') {
        throw new ForbiddenError('Unauthorized: You can only delete menu items for your own stall');
      }

      await this.prisma.menuItem.update({
        where: { id: itemId },
        data: {
          deletedAt: new Date(),
          availabilityState: 'SOLD_OUT',
        },
      });

      await this.auditRepo.append({
        actorId: ownerId,
        actionType: AuditActionType.STALL_CAPACITY_OVERRIDE,
        targetEntity: 'MenuItem',
        targetId: itemId,
        previousValue: { deletedAt: null, name: item.name },
        newValue: { deletedAt: new Date(), availabilityState: 'SOLD_OUT' },
        reason: 'Vendor deleted menu item',
        sessionReference: req.id,
      });

      res.status(200).json({
        success: true,
        message: 'Menu item deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  public updateCapacity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ownerId = req.user!.id;
      const stall = await this.prisma.stall.findFirst({
        where: { ownerId, deletedAt: null },
        include: { capacity: true },
      });

      if (!stall) {
        throw new NotFoundError('No stall associated with this owner account');
      }

      const {
        maxActiveOrders,
        maxOrdersPerWindow,
        windowDurationMinutes,
        maxOrdersPerPickupInterval,
        pickupIntervalMinutes,
        parallelPreparationLimit,
        operationalBufferMinutes,
        pickupGracePeriodMinutes,
      } = req.body;

      const previousCapacity = stall.capacity;

      const capacity = await this.prisma.stallCapacity.upsert({
        where: { stallId: stall.id },
        create: {
          stallId: stall.id,
          maxActiveOrders: maxActiveOrders ?? 20,
          maxOrdersPerWindow: maxOrdersPerWindow ?? 15,
          windowDurationMinutes: windowDurationMinutes ?? 30,
          maxOrdersPerPickupInterval: maxOrdersPerPickupInterval ?? 5,
          pickupIntervalMinutes: pickupIntervalMinutes ?? 10,
          parallelPreparationLimit: parallelPreparationLimit ?? 4,
          operationalBufferMinutes: operationalBufferMinutes ?? 2,
          pickupGracePeriodMinutes: pickupGracePeriodMinutes ?? 15,
        },
        update: {
          ...(maxActiveOrders !== undefined && { maxActiveOrders }),
          ...(maxOrdersPerWindow !== undefined && { maxOrdersPerWindow }),
          ...(windowDurationMinutes !== undefined && { windowDurationMinutes }),
          ...(maxOrdersPerPickupInterval !== undefined && { maxOrdersPerPickupInterval }),
          ...(pickupIntervalMinutes !== undefined && { pickupIntervalMinutes }),
          ...(parallelPreparationLimit !== undefined && { parallelPreparationLimit }),
          ...(operationalBufferMinutes !== undefined && { operationalBufferMinutes }),
          ...(pickupGracePeriodMinutes !== undefined && { pickupGracePeriodMinutes }),
        },
      });

      await this.auditRepo.append({
        actorId: ownerId,
        actionType: AuditActionType.STALL_CAPACITY_OVERRIDE,
        targetEntity: 'StallCapacity',
        targetId: capacity.id,
        previousValue: previousCapacity ? {
          maxActiveOrders: previousCapacity.maxActiveOrders,
          parallelPreparationLimit: previousCapacity.parallelPreparationLimit,
        } : null,
        newValue: {
          maxActiveOrders: capacity.maxActiveOrders,
          parallelPreparationLimit: capacity.parallelPreparationLimit,
          operationalBufferMinutes: capacity.operationalBufferMinutes,
        },
        reason: 'Vendor updated stall operational capacity model',
        sessionReference: req.id,
      });

      res.status(200).json({
        success: true,
        data: {
          stallId: stall.id,
          capacity: {
            maxActiveOrders: capacity.maxActiveOrders,
            maxOrdersPerWindow: capacity.maxOrdersPerWindow,
            windowDurationMinutes: capacity.windowDurationMinutes,
            maxOrdersPerPickupInterval: capacity.maxOrdersPerPickupInterval,
            pickupIntervalMinutes: capacity.pickupIntervalMinutes,
            parallelPreparationLimit: capacity.parallelPreparationLimit,
            operationalBufferMinutes: capacity.operationalBufferMinutes,
            pickupGracePeriodMinutes: capacity.pickupGracePeriodMinutes,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  };
}
