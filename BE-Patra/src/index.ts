import dns from 'node:dns';
import express from 'express';
import cors from 'cors';
import config from './config/config.js';
import logger from './middlewares/logger.js';
import errorHandler from './middlewares/errorHandler.js';
import healthRoute from './routes/health.route.js';
import authRoute from './routes/auth.route.js';
import cctvRoute from './routes/cctv.route.js';
import zoneRoute from './routes/zone.route.js';
import reportRoute from './routes/report.route.js';

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

app.use('/', healthRoute);
app.use('/api/auth', authRoute);
app.use('/api/cctv', cctvRoute);
app.use('/api/zones', zoneRoute);
app.use('/api/reports', reportRoute);

// Error handler terpusat: WAJIB paling akhir setelah semua route.
app.use(errorHandler);

if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  app.listen(config.port, () => {
    console.log(`[BE-Patra] Running on http://localhost:${config.port}`);
  });
}

export default app;
