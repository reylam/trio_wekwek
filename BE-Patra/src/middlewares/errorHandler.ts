import type { Request, Response, NextFunction } from 'express';

// Error handler terpusat: dipasang paling akhir di src/index.ts.
export default function errorHandler(
  err: Error & { status?: number; code?: string; type?: string },
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (res.headersSent) {
    return next(err);
  }

  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({
      ok: false,
      error: { code: 'INVALID_JSON', message: 'Format JSON pada body tidak valid.' },
    });
  }

  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      ok: false,
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Ukuran body request terlalu besar.' },
    });
  }

  const status = typeof err?.status === 'number' ? err.status : 500;
  if (status >= 500) {
    console.error('[BE-Patra unhandled error]', req.method, req.originalUrl, err);
  }

  return res.status(status).json({
    ok: false,
    error: {
      code: err?.code || (status === 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR'),
      message: status === 500 ? 'Terjadi kesalahan pada server.' : err.message,
    },
  });
}
