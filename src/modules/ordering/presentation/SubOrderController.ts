import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { SubOrderManagementService } from '../application/SubOrderManagementService.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../../../shared/errors/DomainErrors.js';
import { IAuditLogRepository } from '../../audit/domain/IAuditLogRepository.js';
import { AuditActionType } from '../../audit/domain/AuditEnums.js';
import { SubOrderStatus } from '../domain/OrderEnums.js';
import { EventOutboxService } from '../../realtime/application/EventOutboxService.js';
import { DomainEventType } from '../../realtime/domain/RealtimeEnums.js';

export class SubOrderController {
  constructor(
    private readonly subOrderService: SubOrderManagementService,
    private readonly prisma: PrismaClient,
    private readonly auditRepo: IAuditLogRepository,
    private readonly outboxService?: EventOutboxService
  ) {}

  public collectOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const user = req.user!;

      // 1. Students are strictly barred from marking an order COLLECTED
      if (user.role === 'STUDENT') {
        throw new ForbiddenError('Students cannot mark orders as collected');
      }

      // 2. Fetch sub-order and verify stall ownership / staff assignment
      const subOrder = await this.prisma.subOrder.findUnique({
        where: { id },
        include: { stall: true, masterOrder: true },
      });

      if (!subOrder) {
        throw new NotFoundError('SubOrder not found');
      }

      // Check stall tenant scope
      if (user.role === 'STALL_OWNER' && subOrder.stall.ownerId !== user.id) {
        throw new ForbiddenError('Unauthorized: Sub-order does not belong to your stall');
      }

      if (user.role === 'STALL_STAFF') {
        if (user.staffAccount?.stallId !== subOrder.stallId) {
          throw new ForbiddenError('Unauthorized: Sub-order does not belong to your assigned stall');
        }
        if (!user.staffAccount.permissions?.includes('MANAGE_ORDERS')) {
          throw new ForbiddenError('Missing required permission: MANAGE_ORDERS');
        }
      }

      // 3. Verify balance is paid before collection
      if (!subOrder.isBalancePaid && Number(subOrder.balanceDueAmount) > 0) {
        throw new ValidationError('Remaining balance must be settled before order collection');
      }

      const userContext = {
        userId: user.id,
        role: user.role,
        staffStallId: user.staffAccount?.stallId,
        staffPermissions: user.staffAccount?.permissions as any,
        ownedStallIds: user.ownedStalls?.map(s => s.id),
      };

      // 4. Execute domain state transition
      await this.subOrderService.confirmPickupCollection(userContext, id);

      if (this.outboxService && subOrder.masterOrder?.studentId) {
        try {
          const env = await this.outboxService.appendEvent({
            channel: `user:${subOrder.masterOrder.studentId}`,
            eventType: DomainEventType.SUBORDER_COLLECTED,
            aggregateType: 'SubOrder',
            aggregateId: id,
            correlationId: (req as any).id || 'req_sub_collect',
            payload: {
              subOrderId: id,
              subOrderNumber: subOrder.subOrderNumber,
              stallId: subOrder.stallId,
              collectedAt: new Date().toISOString(),
            },
          });
          await this.outboxService.publishEnvelope(env);
        } catch (err) {
          console.error('[SubOrderController] Failed to dispatch SUBORDER_COLLECTED event:', err);
        }
      }

      res.status(200).json({
        success: true,
        message: 'Order marked as collected successfully',
        data: {
          subOrderId: id,
          status: SubOrderStatus.COLLECTED,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  public recordCounterSettlement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const user = req.user!;
      const { paymentMethod = 'CASH', notes } = req.body;

      // 1. Students cannot record counter settlements
      if (user.role === 'STUDENT') {
        throw new ForbiddenError('Students cannot self-declare counter settlements');
      }

      const subOrder = await this.prisma.subOrder.findUnique({
        where: { id },
        include: { stall: true, masterOrder: true },
      });

      if (!subOrder) {
        throw new NotFoundError('SubOrder not found');
      }

      // 2. Check stall authorization
      if (user.role === 'STALL_OWNER' && subOrder.stall.ownerId !== user.id) {
        throw new ForbiddenError('Unauthorized: Sub-order does not belong to your stall');
      }

      if (user.role === 'STALL_STAFF') {
        if (user.staffAccount?.stallId !== subOrder.stallId) {
          throw new ForbiddenError('Unauthorized: Sub-order does not belong to your assigned stall');
        }
        if (!user.staffAccount.permissions?.includes('VIEW_PAYMENTS')) {
          throw new ForbiddenError('Missing required permission: VIEW_PAYMENTS');
        }
      }

      if (subOrder.isBalancePaid) {
        throw new ValidationError('Balance for this sub-order is already settled');
      }

      const userContext = {
        userId: user.id,
        role: user.role,
        staffStallId: user.staffAccount?.stallId,
        staffPermissions: user.staffAccount?.permissions as any,
        ownedStallIds: user.ownedStalls?.map(s => s.id),
      };

      // 3. Settle balance in database transaction
      await this.subOrderService.recordCounterBalancePayment(userContext, id);

      // 4. Audit logging
      await this.auditRepo.append({
        actorId: user.id,
        actionType: AuditActionType.STALL_STATUS_OVERRIDE, // Action logged as financial mutation
        targetEntity: 'SubOrder',
        targetId: id,
        previousValue: { isBalancePaid: false },
        newValue: {
          isBalancePaid: true,
          settledAmount: Number(subOrder.balanceDueAmount),
          paymentMethod,
          notes,
        },
        reason: 'Counter balance payment collected at stall',
        sessionReference: req.id,
      });

      if (this.outboxService && subOrder.masterOrder?.studentId) {
        try {
          const env = await this.outboxService.appendEvent({
            channel: `user:${subOrder.masterOrder.studentId}`,
            eventType: DomainEventType.BALANCE_PAYMENT_CONFIRMED,
            aggregateType: 'SubOrder',
            aggregateId: id,
            correlationId: (req as any).id || 'req_sub_cash',
            payload: {
              subOrderId: id,
              subOrderNumber: subOrder.subOrderNumber,
              balancePaidAmount: Number(subOrder.balanceDueAmount),
              paymentMethod: 'COUNTER_CASH',
            },
          });
          await this.outboxService.publishEnvelope(env);
        } catch (err) {
          console.error('[SubOrderController] Failed to dispatch BALANCE_PAYMENT_CONFIRMED event:', err);
        }
      }

      res.status(200).json({
        success: true,
        message: 'Counter balance payment recorded successfully',
        data: {
          subOrderId: id,
          isBalancePaid: true,
          settledAmount: Number(subOrder.balanceDueAmount),
          currency: 'INR',
        },
      });
    } catch (error) {
      next(error);
    }
  };

  public rejectSubOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const user = req.user!;
      const { reason = 'Kitchen operational capacity exceeded' } = req.body;

      if (user.role === 'STUDENT') {
        throw new ForbiddenError('Students cannot reject orders');
      }

      const subOrder = await this.prisma.subOrder.findUnique({
        where: { id },
        include: { stall: true, masterOrder: true },
      });

      if (!subOrder) {
        throw new NotFoundError('SubOrder not found');
      }

      if (user.role === 'STALL_OWNER' && subOrder.stall.ownerId !== user.id) {
        throw new ForbiddenError('Unauthorized: Sub-order does not belong to your stall');
      }

      if (user.role === 'STALL_STAFF') {
        if (user.staffAccount?.stallId !== subOrder.stallId) {
          throw new ForbiddenError('Unauthorized: Sub-order does not belong to your assigned stall');
        }
        if (!user.staffAccount.permissions?.includes('MANAGE_ORDERS')) {
          throw new ForbiddenError('Missing required permission: MANAGE_ORDERS');
        }
      }

      const userContext = {
        userId: user.id,
        role: user.role,
        staffStallId: user.staffAccount?.stallId,
        staffPermissions: user.staffAccount?.permissions as any,
        ownedStallIds: user.ownedStalls?.map(s => s.id),
      };

      await this.subOrderService.rejectOrder(userContext, id, reason);

      if (this.outboxService && subOrder.masterOrder?.studentId) {
        try {
          const env = await this.outboxService.appendEvent({
            channel: `user:${subOrder.masterOrder.studentId}`,
            eventType: DomainEventType.SUBORDER_REJECTED,
            aggregateType: 'SubOrder',
            aggregateId: id,
            correlationId: (req as any).id || 'req_sub_reject',
            payload: {
              subOrderId: id,
              subOrderNumber: subOrder.subOrderNumber,
              stallId: subOrder.stallId,
              reason,
            },
          });
          await this.outboxService.publishEnvelope(env);
        } catch (err) {
          console.error('[SubOrderController] Failed to dispatch SUBORDER_REJECTED event:', err);
        }
      }

      res.status(200).json({
        success: true,
        message: 'Sub-order rejected and flagged for refund eligibility',
        data: {
          subOrderId: id,
          status: SubOrderStatus.REJECTED,
          refundEligible: true,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  public confirmOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const user = req.user!;

      if (user.role === 'STUDENT') {
        throw new ForbiddenError('Students cannot confirm orders');
      }

      const subOrder = await this.prisma.subOrder.findUnique({
        where: { id },
        include: { stall: true, masterOrder: true, pickupSchedule: true },
      });

      if (!subOrder) {
        throw new NotFoundError('SubOrder not found');
      }

      if (user.role === 'STALL_OWNER' && subOrder.stall.ownerId !== user.id) {
        throw new ForbiddenError('Unauthorized: Sub-order does not belong to your stall');
      }

      if (user.role === 'STALL_STAFF') {
        if (user.staffAccount?.stallId !== subOrder.stallId) {
          throw new ForbiddenError('Unauthorized: Sub-order does not belong to your assigned stall');
        }
        if (!user.staffAccount.permissions?.includes('MANAGE_ORDERS')) {
          throw new ForbiddenError('Missing required permission: MANAGE_ORDERS');
        }
      }

      const userContext = {
        userId: user.id,
        role: user.role,
        staffStallId: user.staffAccount?.stallId,
        staffPermissions: user.staffAccount?.permissions as any,
        ownedStallIds: user.ownedStalls?.map(s => s.id),
      };

      await this.subOrderService.confirmOrder(userContext, id);

      await this.auditRepo.append({
        actorId: user.id,
        actionType: AuditActionType.ORDER_MANUAL_ACCEPT,
        targetEntity: 'SubOrder',
        targetId: id,
        previousValue: { status: subOrder.status },
        newValue: { status: SubOrderStatus.CONFIRMED },
        reason: 'Vendor confirmed sub-order for kitchen execution',
        sessionReference: req.id,
      });

      try {
        await this.prisma.notification.create({
          data: {
            userId: subOrder.masterOrder.studentId,
            type: 'ORDER_STATUS',
            title: 'Order Confirmed',
            message: `Your sub-order #${subOrder.subOrderNumber} has been accepted by ${subOrder.stall.name}.`,
            payload: { subOrderId: id, status: SubOrderStatus.CONFIRMED },
          },
        });
      } catch {
        // Non-blocking notification
      }

      if (this.outboxService && subOrder.masterOrder?.studentId) {
        try {
          const env = await this.outboxService.appendEvent({
            channel: `user:${subOrder.masterOrder.studentId}`,
            eventType: DomainEventType.SUBORDER_CONFIRMED,
            aggregateType: 'SubOrder',
            aggregateId: id,
            correlationId: (req as any).id || 'req_sub_confirm',
            payload: {
              subOrderId: id,
              subOrderNumber: subOrder.subOrderNumber,
              stallId: subOrder.stallId,
              scheduledPickupTime: subOrder.pickupSchedule?.scheduledPickupTime
                ? subOrder.pickupSchedule.scheduledPickupTime.toISOString()
                : new Date().toISOString(),
              estimatedPrepMinutes: subOrder.pickupSchedule?.preparationTimeMinutes || 10,
            },
          });
          await this.outboxService.publishEnvelope(env);
        } catch (err) {
          console.error('[SubOrderController] Failed to dispatch SUBORDER_CONFIRMED event:', err);
        }
      }

      res.status(200).json({
        success: true,
        message: 'Sub-order confirmed successfully',
        data: {
          subOrderId: id,
          status: SubOrderStatus.CONFIRMED,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  public prepareOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const user = req.user!;

      if (user.role === 'STUDENT') {
        throw new ForbiddenError('Students cannot start order preparation');
      }

      const subOrder = await this.prisma.subOrder.findUnique({
        where: { id },
        include: { stall: true, masterOrder: true },
      });

      if (!subOrder) {
        throw new NotFoundError('SubOrder not found');
      }

      if (user.role === 'STALL_OWNER' && subOrder.stall.ownerId !== user.id) {
        throw new ForbiddenError('Unauthorized: Sub-order does not belong to your stall');
      }

      if (user.role === 'STALL_STAFF') {
        if (user.staffAccount?.stallId !== subOrder.stallId) {
          throw new ForbiddenError('Unauthorized: Sub-order does not belong to your assigned stall');
        }
        if (!user.staffAccount.permissions?.includes('MANAGE_ORDERS')) {
          throw new ForbiddenError('Missing required permission: MANAGE_ORDERS');
        }
      }

      const userContext = {
        userId: user.id,
        role: user.role,
        staffStallId: user.staffAccount?.stallId,
        staffPermissions: user.staffAccount?.permissions as any,
        ownedStallIds: user.ownedStalls?.map(s => s.id),
      };

      await this.subOrderService.startPreparing(userContext, id);

      await this.auditRepo.append({
        actorId: user.id,
        actionType: AuditActionType.ORDER_MANUAL_ACCEPT,
        targetEntity: 'SubOrder',
        targetId: id,
        previousValue: { status: subOrder.status },
        newValue: { status: SubOrderStatus.PREPARING },
        reason: 'Kitchen started dish preparation',
        sessionReference: req.id,
      });

      try {
        await this.prisma.notification.create({
          data: {
            userId: subOrder.masterOrder.studentId,
            type: 'ORDER_STATUS',
            title: 'Order Preparing',
            message: `Kitchen at ${subOrder.stall.name} has started preparing your order.`,
            payload: { subOrderId: id, status: SubOrderStatus.PREPARING },
          },
        });
      } catch {
        // Non-blocking notification
      }

      if (this.outboxService && subOrder.masterOrder?.studentId) {
        try {
          const env = await this.outboxService.appendEvent({
            channel: `user:${subOrder.masterOrder.studentId}`,
            eventType: DomainEventType.SUBORDER_PREPARING,
            aggregateType: 'SubOrder',
            aggregateId: id,
            correlationId: (req as any).id || 'req_sub_prep',
            payload: {
              subOrderId: id,
              subOrderNumber: subOrder.subOrderNumber,
              stallId: subOrder.stallId,
              startedAt: new Date().toISOString(),
            },
          });
          await this.outboxService.publishEnvelope(env);
        } catch (err) {
          console.error('[SubOrderController] Failed to dispatch SUBORDER_PREPARING event:', err);
        }
      }

      res.status(200).json({
        success: true,
        message: 'Sub-order marked as PREPARING',
        data: {
          subOrderId: id,
          status: SubOrderStatus.PREPARING,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  public markOrderReady = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = req.params.id as string;
      const user = req.user!;

      if (user.role === 'STUDENT') {
        throw new ForbiddenError('Students cannot mark orders ready');
      }

      const subOrder = await this.prisma.subOrder.findUnique({
        where: { id },
        include: { stall: { include: { capacity: true } }, masterOrder: true },
      });

      if (!subOrder) {
        throw new NotFoundError('SubOrder not found');
      }

      if (user.role === 'STALL_OWNER' && subOrder.stall.ownerId !== user.id) {
        throw new ForbiddenError('Unauthorized: Sub-order does not belong to your stall');
      }

      if (user.role === 'STALL_STAFF') {
        if (user.staffAccount?.stallId !== subOrder.stallId) {
          throw new ForbiddenError('Unauthorized: Sub-order does not belong to your assigned stall');
        }
        if (!user.staffAccount.permissions?.includes('MANAGE_ORDERS')) {
          throw new ForbiddenError('Missing required permission: MANAGE_ORDERS');
        }
      }

      const userContext = {
        userId: user.id,
        role: user.role,
        staffStallId: user.staffAccount?.stallId,
        staffPermissions: user.staffAccount?.permissions as any,
        ownedStallIds: user.ownedStalls?.map(s => s.id),
      };

      await this.subOrderService.markReady(userContext, id);

      await this.auditRepo.append({
        actorId: user.id,
        actionType: AuditActionType.ORDER_MANUAL_ACCEPT,
        targetEntity: 'SubOrder',
        targetId: id,
        previousValue: { status: subOrder.status },
        newValue: { status: SubOrderStatus.READY },
        reason: 'Food preparation completed and placed in pickup bay',
        sessionReference: req.id,
      });

      try {
        await this.prisma.notification.create({
          data: {
            userId: subOrder.masterOrder.studentId,
            type: 'ORDER_STATUS',
            title: 'Order Ready For Pickup!',
            message: `Your food at ${subOrder.stall.name} is ready for pickup! Please bring your verification pass.`,
            payload: { subOrderId: id, status: SubOrderStatus.READY },
          },
        });
      } catch {
        // Non-blocking notification
      }

      if (this.outboxService && subOrder.masterOrder?.studentId) {
        try {
          const readyAt = new Date();
          const graceMinutes = subOrder.stall.capacity?.pickupGracePeriodMinutes || 15;
          const graceExpiry = new Date(readyAt.getTime() + graceMinutes * 60 * 1000);
          const env = await this.outboxService.appendEvent({
            channel: `user:${subOrder.masterOrder.studentId}`,
            eventType: DomainEventType.SUBORDER_READY,
            aggregateType: 'SubOrder',
            aggregateId: id,
            correlationId: (req as any).id || 'req_sub_ready',
            payload: {
              subOrderId: id,
              subOrderNumber: subOrder.subOrderNumber,
              stallId: subOrder.stallId,
              readyAt: readyAt.toISOString(),
              pickupGraceExpiresAt: graceExpiry.toISOString(),
            },
          });
          await this.outboxService.publishEnvelope(env);
        } catch (err) {
          console.error('[SubOrderController] Failed to dispatch SUBORDER_READY event:', err);
        }
      }

      res.status(200).json({
        success: true,
        message: 'Sub-order marked as READY for pickup',
        data: {
          subOrderId: id,
          status: SubOrderStatus.READY,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}
