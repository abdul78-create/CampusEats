import { Request, Response, NextFunction } from 'express';
import { PrismaClient, RefundStatus } from '@prisma/client';
import { NotFoundError, ValidationError } from '../../../shared/errors/DomainErrors.js';
import { IAuditLogRepository } from '../../audit/domain/IAuditLogRepository.js';
import { AuditActionType } from '../../audit/domain/AuditEnums.js';
import { SubOrderStatus } from '../../ordering/domain/OrderEnums.js';
import crypto from 'crypto';

export class AdminController {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly auditRepo: IAuditLogRepository
  ) {}

  public updateOperatingHours = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { stallId, hours } = req.body;
      const adminId = req.user!.id;

      const stall = await this.prisma.stall.findUnique({
        where: { id: stallId },
      });

      if (!stall) {
        throw new NotFoundError('Stall not found');
      }

      // Upsert official operating hours in transaction
      await this.prisma.$transaction(async tx => {
        for (const h of hours) {
          await tx.stallOperatingHour.upsert({
            where: {
              stallId_dayOfWeek: {
                stallId,
                dayOfWeek: h.dayOfWeek,
              },
            },
            create: {
              id: crypto.randomUUID(),
              stallId,
              dayOfWeek: h.dayOfWeek,
              openTime: h.openTime,
              closeTime: h.closeTime,
            },
            update: {
              openTime: h.openTime,
              closeTime: h.closeTime,
            },
          });
        }
      });

      // Audit log
      await this.auditRepo.append({
        actorId: adminId,
        actionType: AuditActionType.STALL_CREATED, // Official policy action
        targetEntity: 'StallOperatingHour',
        targetId: stallId,
        newValue: hours,
        reason: 'Admin updated official stall operating hours',
        sessionReference: req.id,
      });

      res.status(200).json({
        success: true,
        message: 'Official operating hours updated successfully',
        data: { stallId, hours },
      });
    } catch (error) {
      next(error);
    }
  };

  public processRefund = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const subOrderId = req.params.subOrderId as string;
      const { reason } = req.body;
      const adminId = req.user!.id;

      const subOrder = await this.prisma.subOrder.findUnique({
        where: { id: subOrderId },
        include: { refund: true },
      });

      if (!subOrder) {
        throw new NotFoundError('SubOrder not found');
      }

      if (subOrder.refund) {
        throw new ValidationError('A refund has already been recorded for this sub-order');
      }

      if (subOrder.status !== SubOrderStatus.REJECTED && subOrder.status !== SubOrderStatus.CANCELLED) {
        throw new ValidationError(`Sub-order in status ${subOrder.status} is not eligible for refund`);
      }

      const refundAmount = subOrder.advancePaidAmount;
      const refundId = crypto.randomUUID();

      // Atomic refund transaction
      await this.prisma.$transaction(async tx => {
        await tx.refund.create({
          data: {
            id: refundId,
            subOrderId,
            idempotencyKey: `ref_idem_${subOrderId}_${Date.now()}`,
            amountPaidForSuborder: refundAmount,
            refundAmount,
            refundReason: reason,
            refundStatus: RefundStatus.REFUNDED,
            completedAt: new Date(),
          },
        });

        await tx.subOrder.update({
          where: { id: subOrderId },
          data: { status: SubOrderStatus.REFUNDED },
        });
      });

      // Audit log
      await this.auditRepo.append({
        actorId: adminId,
        actionType: AuditActionType.ADMIN_REFUND_PROCESSED,
        targetEntity: 'Refund',
        targetId: refundId,
        newValue: {
          subOrderId,
          amount: Number(refundAmount),
          reason,
          status: 'PROCESSED',
        },
        reason: 'Administrative isolated refund processed',
        sessionReference: req.id,
      });

      res.status(200).json({
        success: true,
        message: 'Refund processed successfully',
        data: {
          refundId,
          subOrderId,
          refundAmount: Number(refundAmount),
          status: 'PROCESSED',
        },
      });
    } catch (error) {
      next(error);
    }
  };

  public verifyAuditChain = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const report = await this.auditRepo.verifyChain();
      res.status(200).json({
        success: true,
        data: {
          isValid: report.isValid,
          totalRecordsChecked: report.totalRecordsChecked,
          brokenSequenceNumber: report.brokenSequenceNumber ? String(report.brokenSequenceNumber) : undefined,
          errorDetails: report.errorDetails,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  public getAuditLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const skip = (page - 1) * limit;

      const [total, logs] = await Promise.all([
        this.prisma.auditLog.count(),
        this.prisma.auditLog.findMany({
          orderBy: { sequenceNumber: 'desc' },
          skip,
          take: limit,
        }),
      ]);

      res.status(200).json({
        success: true,
        data: logs.map(l => ({
          id: l.id,
          sequenceNumber: String(l.sequenceNumber),
          actorId: l.actorId,
          actionType: l.actionType,
          targetEntity: l.targetEntity,
          targetId: l.targetId,
          previousValue: l.previousValue,
          newValue: l.newValue,
          reason: l.reason,
          timestamp: l.timestamp,
          previousHash: l.previousHash,
          currentHash: l.currentHash,
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
}
