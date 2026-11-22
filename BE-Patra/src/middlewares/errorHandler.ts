import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import type { ApiErrorDetail } from '../interface/index.js';

export class AppError extends Error {
  status: number;
  code: string;
  details?: ApiErrorDetail[];

  constructor(
    status: number,
    code: string,
    message: string,
    details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (details) {
      this.details = details;
    }
  }
}

function mapMulterError(err: multer.MulterError): {
  status: number;
  code: string;
  message: string;
} {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return {
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Ukuran foto melebihi batas maksimal 4 MB.',
    };
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return {
      status: 400,
      code: 'UPLOAD_ERROR',
      message: `Nama field file tidak sesuai: "${err.field || 'unknown'}".`,
    };
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return {
      status: 400,
      code: 'UPLOAD_ERROR',
      message: 'Jumlah file yang diunggah melebihi batas.',
    };
  }
  return {
    status: 400,
    code: 'UPLOAD_ERROR',
    message: `Gagal mengunggah file: ${err.message}`,
  };
}

// Error handler terpusat: dipasang paling akhir di src/index.ts.
export default function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  if (err instanceof ZodError) {
    const details: ApiErrorDetail[] = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    return res.status(400).json({
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: details[0]?.message || 'Data permintaan tidak valid.',
        details,
      },
    });
  }

  if (err instanceof multer.MulterError) {
    const mapped = mapMulterError(err);
    return res.status(mapped.status).json({
      ok: false,
      error: {
        code: mapped.code,
        message: mapped.message,
      },
    });
  }

  const rawErr = err as { type?: string; status?: number; code?: string; message?: string };

  if (rawErr?.type === 'entity.parse.failed') {
    return res.status(400).json({
      ok: false,
      error: { code: 'INVALID_JSON', message: 'Format JSON pada body tidak valid.' },
    });
  }

  if (rawErr?.type === 'entity.too.large') {
    return res.status(413).json({
      ok: false,
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Ukuran body request terlalu besar.' },
    });
  }

  const status = typeof rawErr?.status === 'number' ? rawErr.status : 500;
  if (status >= 500) {
    console.error('[BE-Patra unhandled error]', req.method, req.originalUrl, err);
  }

  return res.status(status).json({
    ok: false,
    error: {
      code: rawErr?.code || (status === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR'),
      message:
        status === 500
          ? 'Terjadi kesalahan pada server.'
          : rawErr?.message || 'Permintaan gagal diproses.',
    },
  });
}
