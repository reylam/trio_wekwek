import dotenv from 'dotenv';

dotenv.config();

export function normalizeOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, '');
}

export function isOriginAllowed(
  origin: string,
  allowedOrigins: readonly string[],
): boolean {
  const normalized = normalizeOrigin(origin);
  for (const entry of allowedOrigins) {
    if (entry === normalized) return true;
    // Dukung wildcard subdomain bila dieksplisitkan (mis. https://*.vercel.app)
    const wildcardMatch = entry.match(/^(https?:\/\/)\*\.(.+)$/);
    if (wildcardMatch) {
      const [, scheme, baseDomain] = wildcardMatch;
      if (
        normalized.startsWith(scheme) &&
        normalized.endsWith(`.${baseDomain}`) &&
        normalized.length > scheme.length + baseDomain.length + 1
      ) {
        return true;
      }
    }
  }
  return false;
}

const config = {
  port: Number.parseInt(process.env.PORT || '3001', 10),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean),
  enableDemoLogin: process.env.ENABLE_DEMO_LOGIN === 'true',
  cameraCooldownSec: Number.parseInt(process.env.CAMERA_COOLDOWN_SEC || '30', 10),
  supabaseBucket: process.env.SUPABASE_BUCKET || 'patra-evidence',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
};

export default config;
