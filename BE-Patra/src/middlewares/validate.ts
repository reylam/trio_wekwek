import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';
import { AppError } from './errorHandler.js';

export function validateBody<T extends ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return next(parsed.error);
    }
    res.locals.validatedBody = parsed.data;
    req.body = parsed.data;
    return next();
  };
}

export function validateQuery<T extends ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return next(parsed.error);
    }
    // Di Express 5 req.query bersifat read-only getter, jadi hasil validasi disimpan di res.locals.
    res.locals.validatedQuery = parsed.data;
    return next();
  };
}

export function validateMultipartPayload<T extends ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const rawPayload = req.body?.payload;
    let payloadObj: unknown = rawPayload;

    if (typeof rawPayload === 'string') {
      try {
        payloadObj = JSON.parse(rawPayload);
      } catch {
        return next(
          new AppError(400, 'INVALID_JSON', 'Format JSON pada field payload tidak valid.'),
        );
      }
    } else if (rawPayload === undefined) {
      payloadObj = {};
    }

    const parsed = schema.safeParse(payloadObj);
    if (!parsed.success) {
      return next(parsed.error);
    }

    res.locals.validatedBody = parsed.data;
    return next();
  };
}
