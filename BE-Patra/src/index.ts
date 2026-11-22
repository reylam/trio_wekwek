import dns from 'node:dns';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import config from './config/config.js';
import logger from './middlewares/logger.js';
import errorHandler from './middlewares/errorHandler.js';

// Utamakan IPv4 untuk mencegah ECONNRESET/fetch failed ke Supabase di jaringan IPv6/NAT64.
dns.setDefaultResultOrder('ipv4first');

const app = express();

app.use(logger);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || config.allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      const corsErr = new Error('Origin tidak diizinkan oleh CORS.') as Error & {
        status?: number;
        code?: string;
      };
      corsErr.status = 403;
      corsErr.code = 'CORS_FORBIDDEN';
      return callback(corsErr);
    },
  }),
);
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    data: {
      service: 'BE-Patra',
      status: 'OK',
      onVercel: Boolean(process.env.VERCEL),
    },
  });
});

// Error handler terpusat: WAJIB paling akhir setelah semua route.
app.use(errorHandler);

if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`[BE-Patra] Running on http://localhost:${config.port}`);
  });
}

export default app;
