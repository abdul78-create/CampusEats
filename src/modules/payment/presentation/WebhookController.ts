import { Request, Response, NextFunction } from 'express';
import { PaymentService } from '../application/PaymentService.js';
import { UnauthorizedError } from '../../../shared/errors/DomainErrors.js';

export class WebhookController {
  constructor(private readonly paymentService: PaymentService) {}

  public handlePaymentWebhook = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const signature = (req.headers['x-webhook-signature'] || req.headers['x-signature']) as string;
      const timestamp = (req.headers['x-webhook-timestamp'] || req.headers['x-timestamp']) as string;

      if (!signature || !timestamp) {
        throw new UnauthorizedError('Missing required webhook signature or timestamp header');
      }

      // Authoritative raw body buffer
      const rawBody: Buffer = (req as any).rawBody || 
        (Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body)));

      const result = await this.paymentService.handleWebhook(rawBody, signature, timestamp);

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
