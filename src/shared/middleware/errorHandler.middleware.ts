import { Request, Response, NextFunction } from 'express';
import { DomainError } from '../errors/DomainErrors.js';

export function errorHandlerMiddleware(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.id || (res.getHeader('X-Request-ID') as string) || 'unknown';

  // 1. CORS Policy Violations
  if (err.message && err.message.includes('CORS')) {
    res.status(403).json({
      success: false,
      error: {
        code: 'CORS_FORBIDDEN',
        message: 'Origin is not allowed by CORS policy.',
        requestId,
      },
    });
    return;
  }

  // 2. Domain Errors (robust against instanceof across module boundaries)
  if (err instanceof DomainError || (err && typeof (err as any).statusCode === 'number' && typeof (err as any).errorCode === 'string')) {
    const domainErr = err as any;
    const errorBody: Record<string, any> = {
      code: domainErr.errorCode,
      message: domainErr.message,
      requestId,
    };

    if (domainErr.details !== undefined) {
      errorBody.details = domainErr.details;
    }

    if (domainErr.errorCode === 'PICKUP_TIME_UNAVAILABLE') {
      errorBody.requestedTime = domainErr.requestedTime || domainErr.details?.requestedTime;
      errorBody.nextAvailableTime = domainErr.nextAvailableTime || domainErr.details?.nextAvailableTime;
    }

    res.status(domainErr.statusCode).json({
      success: false,
      error: errorBody,
    });
    return;
  }

  // 2. Prisma Database Errors (Sanitized — never leak table names or SQL)
  if (err.constructor.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as any;
    if (prismaErr.code === 'P2002') {
      res.status(409).json({
        success: false,
        error: {
          code: 'UNIQUE_CONSTRAINT_VIOLATION',
          message: 'A record with this identifier already exists.',
          requestId,
        },
      });
      return;
    }

    if (prismaErr.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: 'The requested resource was not found.',
          requestId,
        },
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: {
        code: 'DATABASE_OPERATION_FAILED',
        message: 'A database constraint violation occurred.',
        requestId,
      },
    });
    return;
  }

  // 3. Catch-all Internal Error (Never expose stack traces or secrets)
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred.',
      requestId,
    },
  });
}
