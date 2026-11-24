import type { NextFunction, Request, Response } from 'express';
import { AppError } from './errorHandler.js';

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  keyByUser?: boolean;
  maxBuckets?: number;
  now?: () => number;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

/**
 * Sets standard HTTP security headers across all Express API responses.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');

  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}

/**
 * Extracts a bounded client IP identifier from proxy or socket headers.
 */
export function extractClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim().length > 0) {
    return forwarded.split(',')[0]!.trim().slice(0, 64) || 'unknown';
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(',')[0]!.trim().slice(0, 64) || 'unknown';
  }

  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim().length > 0) {
    return realIp.trim().slice(0, 64);
  }

  const fallbackIp = req.ip || req.socket?.remoteAddress || 'unknown';
  return String(fallbackIp).trim().slice(0, 64) || 'unknown';
}

/**
 * Creates a memory-bounded, sliding-fixed-window rate limiter suitable for serverless
 * and Express middlewares without external dependencies.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const windowMs = Math.max(1_000, Math.floor(options.windowMs));
  const maxRequests = Math.max(1, Math.floor(options.maxRequests));
  const maxBuckets = Math.max(10, Math.floor(options.maxBuckets ?? 5_000));
  const getNow = options.now ?? (() => Date.now());
  const buckets = new Map<string, RateLimitBucket>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const nowMs = getNow();
    const ip = extractClientIp(req);
    const key =
      options.keyByUser && req.user?.sub
        ? `${options.keyPrefix}:${req.user.sub}:${ip}`
        : `${options.keyPrefix}:${ip}`;

    let bucket = buckets.get(key);
    if (!bucket || nowMs >= bucket.resetAt) {
      if (!bucket && buckets.size >= maxBuckets) {
        // Purge expired buckets first; if still full, evict the oldest bucket.
        for (const [existingKey, existingBucket] of buckets) {
          if (nowMs >= existingBucket.resetAt) {
            buckets.delete(existingKey);
          }
          if (buckets.size < maxBuckets) break;
        }
        while (buckets.size >= maxBuckets) {
          const oldestKey = buckets.keys().next().value;
          if (oldestKey === undefined) break;
          buckets.delete(oldestKey);
        }
      }

      bucket = { count: 0, resetAt: nowMs + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, maxRequests - bucket.count);
    const resetEpochSec = Math.ceil(bucket.resetAt / 1000);

    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(resetEpochSec));

    if (bucket.count > maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - nowMs) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return next(
        new AppError(
          429,
          'RATE_LIMIT_EXCEEDED',
          'Terlalu banyak permintaan. Silakan coba lagi beberapa saat lagi.',
        ),
      );
    }

    next();
  };
}

export function createAuthRateLimiter() {
  return createRateLimiter({
    windowMs: 60_000,
    maxRequests: 20,
    keyPrefix: 'auth',
  });
}

export function createPublicRateLimiter() {
  return createRateLimiter({
    windowMs: 60_000,
    maxRequests: 120,
    keyPrefix: 'public',
  });
}

export function createAutoDetectRateLimiter() {
  return createRateLimiter({
    windowMs: 60_000,
    maxRequests: 15,
    keyPrefix: 'auto-detect',
    keyByUser: true,
  });
}

export function createApiDefaultRateLimiter() {
  return createRateLimiter({
    windowMs: 60_000,
    maxRequests: 240,
    keyPrefix: 'api',
  });
}
