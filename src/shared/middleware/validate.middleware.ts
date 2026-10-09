import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../errors/DomainErrors.js';

interface RequestValidationConfig {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export function validateRequest(config: RequestValidationConfig) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (config.params) {
        req.params = await config.params.parseAsync(req.params);
      }
      if (config.query) {
        req.query = await config.query.parseAsync(req.query);
      }
      if (config.body) {
        req.body = await config.body.parseAsync(req.body);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        next(new ValidationError('Request validation failed', details));
        return;
      }
      next(error);
    }
  };
}
