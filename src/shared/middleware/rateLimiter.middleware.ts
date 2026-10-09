import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

const isTest = process.env.NODE_ENV === 'test';

// Auth endpoints: 15-min window, 20 requests max per IP
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts. Please try again after 15 minutes.',
        requestId: req.id,
      },
    });
  },
});

// Checkout & financial mutations: 1-min window, 30 requests max
export const checkoutRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isTest ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Order creation rate limit reached. Please wait a minute before submitting again.',
        requestId: req.id,
      },
    });
  },
});

// Sensitive admin operations: 1-min window, 20 requests max
export const adminRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isTest ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Admin rate limit exceeded. Please throttle requests.',
        requestId: req.id,
      },
    });
  },
});
