import dotenv from 'dotenv';

dotenv.config();

const config = {
  port: Number.parseInt(process.env.PORT || '3001', 10),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  enableDemoLogin: process.env.ENABLE_DEMO_LOGIN === 'true',
  cameraCooldownSec: Number.parseInt(process.env.CAMERA_COOLDOWN_SEC || '30', 10),
  supabaseBucket: process.env.SUPABASE_BUCKET || 'patra-evidence',
  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
};

export default config;
