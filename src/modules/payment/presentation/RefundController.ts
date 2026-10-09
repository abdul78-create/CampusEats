import { Request, Response, NextFunction } from 'express';
import { PaymentService } from '../application/PaymentService.js';
import { PrismaClient } from '@prisma/client';
import { NotFoundError, ForbiddenError } from '../../../shared/errors/DomainErrors.js';

export class RefundController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly prisma: PrismaClient
  ) {}

  public processSubOrderRefund = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const adminUserId = req.user!.id;
      const subOrderId = req.params.id as string;
      const { reason = 'Order rejected by food stall' } = req.body;
      const idempotencyKey = 
        (req.headers['idempotency-key'] as string) || 
        req.body.idempotencyKey || 
        `ref_${subOrderId}_${Date.now()}`;

      const result = await this.paymentService.processIsolatedRefund(
        adminUserId,
        subOrderId,
        reason,
        idempotencyKey
      );

      res.status(200).json({
        success: true,
        message: 'Sub-order refund processed successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  public getRefundStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const subOrderId = req.params.id as string;
      const user = req.user!;

      const refund = await this.prisma.refund.findUnique({
        where: { subOrderId },
        include: {
          subOrder: {
            include: { masterOrder: true },
          },
        },
      });

      if (!refund) {
        throw new NotFoundError('Refund record not found');
      }

      // IDOR protection: only student who owns order or admin can view
      if (user.role === 'STUDENT' && refund.subOrder.masterOrder.studentId !== user.id) {
        throw new ForbiddenError('Unauthorized: You cannot access this refund');
      }

      res.status(200).json({
        success: true,
        data: {
          id: refund.id,
          subOrderId: refund.subOrderId,
          refundAmount: Number(refund.refundAmount),
          amountPaidForSuborder: Number(refund.amountPaidForSuborder),
          refundReason: refund.refundReason,
          refundStatus: refund.refundStatus,
          providerRefundId: refund.providerRefundId,
          initiatedAt: refund.initiatedAt,
          completedAt: refund.completedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  };
}
