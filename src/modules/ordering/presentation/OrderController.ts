import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { 
  CheckoutService, 
  CheckoutItemInput, 
  CheckoutStallCartInput 
} from '../application/CheckoutService.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../../../shared/errors/DomainErrors.js';
import { StudentAccountStatus } from '../../identity/domain/IdentityEnums.js';
import { OrderStateValidator } from '../domain/OrderStateValidator.js';
import { SubOrderStatus } from '../domain/OrderEnums.js';

export class OrderController {
  constructor(
    private readonly checkoutService: CheckoutService,
    private readonly prisma: PrismaClient
  ) {}

  public checkout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Security: studentId is ALWAYS derived from the authenticated principal
      const studentId = req.user!.id;
      const idempotencyKey = (req.headers['idempotency-key'] as string) || `auto_${req.id}`;
      const { advancePercentage, items, requestedPickupTime } = req.body;

      // Load authoritative menu item definitions from PostgreSQL
      const itemIds = items.map((i: { menuItemId: string; quantity: number }) => i.menuItemId);
      const menuItems = await this.prisma.menuItem.findMany({
        where: { id: { in: itemIds }, deletedAt: null },
        include: { stall: true },
      });

      if (menuItems.length !== items.length) {
        throw new NotFoundError('One or more selected menu items could not be found');
      }

      // Check item availability state and stall approval
      for (const item of menuItems) {
        if (item.availabilityState === 'SOLD_OUT') {
          throw new ValidationError(`Menu item "${item.name}" is currently marked sold out and unavailable for ordering`);
        }
        if (!item.stall.isApproved || item.stall.deletedAt !== null) {
          throw new ValidationError(`Stall "${item.stall.name}" is not approved or is inactive`);
        }
      }

      // Group items deterministically by stall
      const stallMap = new Map<string, CheckoutItemInput[]>();
      for (const itemInput of items) {
        const dbItem = menuItems.find(m => m.id === itemInput.menuItemId)!;
        if (!stallMap.has(dbItem.stallId)) {
          stallMap.set(dbItem.stallId, []);
        }
        stallMap.get(dbItem.stallId)!.push({
          menuItemId: dbItem.id,
          name: dbItem.name,
          price: Number(dbItem.price),
          preparationTimeMinutes: dbItem.preparationTimeMinutes,
          quantity: itemInput.quantity,
        });
      }

      const stallCarts: CheckoutStallCartInput[] = Array.from(stallMap.entries()).map(([stallId, stallItems]) => ({
        stallId,
        items: stallItems,
        requestedPickupTime: requestedPickupTime ? new Date(requestedPickupTime) : undefined,
      }));

      const studentStatus = (req.user!.studentProfile?.accountStatus as StudentAccountStatus) || StudentAccountStatus.PENDING_VERIFICATION;

      const result = await this.checkoutService.executeCheckout({
        idempotencyKey,
        studentId,
        studentAccountStatus: studentStatus,
        advancePercentage,
        stallCarts,
      });

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  public getMyOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const studentId = req.user!.id;
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
      const skip = (page - 1) * limit;

      const [total, orders] = await Promise.all([
        this.prisma.masterOrder.count({ where: { studentId } }),
        this.prisma.masterOrder.findMany({
          where: { studentId },
          include: {
            subOrders: {
              include: {
                stall: { select: { id: true, name: true, campusBlock: true } },
                items: true,
                pickupSchedule: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
      ]);

      res.status(200).json({
        success: true,
        data: orders.map(o => ({
          id: o.id,
          orderNumber: o.orderNumber,
          totalAmount: Number(o.totalAmount),
          advanceAmount: Number(o.advanceAmount),
          remainingAmount: Number(o.remainingAmount),
          advancePercentage: o.advancePercentage,
          status: OrderStateValidator.deriveMasterOrderStatus(o.subOrders.map(so => so.status as SubOrderStatus)),
          createdAt: o.createdAt,
          subOrders: o.subOrders.map(so => ({
            id: so.id,
            subOrderNumber: so.subOrderNumber,
            stall: so.stall,
            status: so.status,
            totalAmount: Number(so.subtotalAmount),
            advancePaidAmount: Number(so.advancePaidAmount),
            remainingBalanceAmount: Number(so.balanceDueAmount),
            isBalancePaid: so.isBalancePaid,
            itemCount: so.items.length,
            pickupSchedule: so.pickupSchedule ? {
              scheduledPickupTime: so.pickupSchedule.scheduledPickupTime,
              preparationTimeMinutes: so.pickupSchedule.preparationTimeMinutes,
            } : null,
          })),
        })),
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  };

  public getOrderById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const order = await this.prisma.masterOrder.findUnique({
        where: { id },
        include: {
          subOrders: {
            include: {
              stall: { select: { id: true, name: true, campusBlock: true } },
              items: true,
              pickupSchedule: true,
            },
          },
        },
      });

      if (!order) {
        throw new NotFoundError('Order could not be found');
      }

      // BOLA / IDOR Protection: Students can only view their own orders
      if (req.user!.role === 'STUDENT' && order.studentId !== req.user!.id) {
        throw new ForbiddenError('Unauthorized: You cannot access another student’s order');
      }

      res.status(200).json({
        success: true,
        data: {
          id: order.id,
          orderNumber: order.orderNumber,
          studentId: order.studentId,
          totalAmount: Number(order.totalAmount),
          advanceAmount: Number(order.advanceAmount),
          remainingAmount: Number(order.remainingAmount),
          advancePercentage: order.advancePercentage,
          status: OrderStateValidator.deriveMasterOrderStatus(order.subOrders.map(so => so.status as SubOrderStatus)),
          createdAt: order.createdAt,
          subOrders: order.subOrders.map(so => ({
            id: so.id,
            subOrderNumber: so.subOrderNumber,
            stall: so.stall,
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
              menuItemId: it.menuItemId,
              name: it.snapshotItemName,
              unitPrice: Number(it.snapshotPrice),
              quantity: it.quantity,
              totalPrice: Number(it.totalPrice),
              prepMinutes: it.snapshotPrepMinutes,
            })),
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  };
}
