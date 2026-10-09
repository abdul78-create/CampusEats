import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers['x-request-id'];
  const requestId = (typeof incomingId === 'string' && incomingId.trim().length > 0)
    ? incomingId.trim()
    : `req_${crypto.randomUUID()}`;

  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}
