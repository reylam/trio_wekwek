import express, { type Request, type Response } from 'express';
import { healthdb } from '../middlewares/healthdb.js';

const router = express.Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    data: {
      service: 'BE-Patra',
      status: 'OK',
      onVercel: Boolean(process.env.VERCEL),
      endpoints: ['/health', '/health/db', '/api/public/cities'],
    },
  });
});

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    data: {
      service: 'BE-Patra',
      status: 'OK',
      onVercel: Boolean(process.env.VERCEL),
    },
  });
});

router.get('/health/db', healthdb);

export default router;
