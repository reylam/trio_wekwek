import dns from 'node:dns';
import express from 'express';
import cors from 'cors';
import config from './config/config.js';
import logger from './middlewares/logger.js';
import errorHandler from './middlewares/errorHandler.js';
import {
  createApiDefaultRateLimiter,
  createAuthRateLimiter,
  createPublicRateLimiter,
  securityHeaders,
} from './middlewares/security.js';
import healthRoute from './routes/health.route.js';
import authRoute from './routes/auth.route.js';
import publicRoute from './routes/public.route.js';
import cctvRoute from './routes/cctv.route.js';
import zoneRoute from './routes/zone.route.js';
import reportRoute from './routes/report.route.js';
import dinasRoute from './routes/dinas.route.js';
import relocationSiteRoute from './routes/relocationSite.route.js';

// Utamakan IPv4 untuk mencegah ECONNRESET/fetch failed ke Supabase di jaringan IPv6/NAT64.
dns.setDefaultResultOrder('ipv4first');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(securityHeaders);
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
app.use(express.json({ limit: '100kb' }));

app.use('/', healthRoute);
app.use('/api', createApiDefaultRateLimiter());
app.use('/api/auth', createAuthRateLimiter(), authRoute);
app.use('/api/public', createPublicRateLimiter(), publicRoute);
app.use('/api/cctv', cctvRoute);
app.use('/api/zones', zoneRoute);
app.use('/api/reports', reportRoute);
app.use('/api/dinas', dinasRoute);
app.use('/api/relocation-sites', relocationSiteRoute);

// Error handler terpusat: WAJIB paling akhir setelah semua route.
app.use(errorHandler);

if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  app.listen(config.port, () => {
    console.log(`[BE-Patra] Running on http://localhost:${config.port}`);
  });
}

export default app;
