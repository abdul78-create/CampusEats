import { Request, Response, NextFunction } from 'express';
import { PaymentService } from '../application/PaymentService.js';
import { ValidationError } from '../../../shared/errors/DomainErrors.js';

export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  public initiateAdvancePayment = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user!.id;
      const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body.idempotencyKey;

      if (!idempotencyKey) {
        throw new ValidationError('Idempotency-Key header or body field is required');
      }

      const { orderId, upiVpa } = req.body;
      if (!orderId) {
        throw new ValidationError('orderId is required');
      }

      const result = await this.paymentService.initiateAdvancePayment(userId, {
        orderId,
        idempotencyKey,
        upiVpa,
      });

      res.status(200).json({
        success: true,
        message: 'Payment session initiated successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  public initiateBalancePayment = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user!.id;
      const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body.idempotencyKey;

      if (!idempotencyKey) {
        throw new ValidationError('Idempotency-Key header or body field is required');
      }

      const { subOrderId } = req.body;
      if (!subOrderId) {
        throw new ValidationError('subOrderId is required');
      }

      const result = await this.paymentService.initiateBalancePayment(userId, {
        subOrderId,
        idempotencyKey,
      });

      res.status(200).json({
        success: true,
        message: 'Balance payment session initiated successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  public getPaymentStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user!.id;
      const userRole = req.user!.role;
      const orderId = req.params.orderId as string;

      const result = await this.paymentService.getPaymentStatus(orderId, userId, userRole);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };
}
