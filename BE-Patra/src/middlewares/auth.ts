import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config/config.js';
import { USER_ROLES, type JwtUserPayload, type UserRole } from '../interface/index.js';
import { AppError } from './errorHandler.js';

declare global {
  namespace Express {
    interface Request {
      user?: JwtUserPayload;
    }
  }
}

const VALID_ROLES = new Set<string>(USER_ROLES);

function resolveSecret(secretOverride?: string): string {
  const secret = secretOverride ?? config.jwtSecret;
  if (!secret || secret.length < 16) {
    throw new AppError(
      500,
      'SERVER_MISCONFIGURED',
      'Konfigurasi JWT_SECRET pada server belum lengkap atau terlalu pendek.',
    );
  }
  return secret;
}

export type SignAuthTokenPayload = Omit<
  JwtUserPayload,
  'fullName' | 'teamId' | 'teamName' | 'assignedDistricts'
> &
  Partial<
    Pick<JwtUserPayload, 'fullName' | 'teamId' | 'teamName' | 'assignedDistricts'>
  >;

export function signAuthToken(
  payload: SignAuthTokenPayload,
  secretOverride?: string,
): string {
  const secret = resolveSecret(secretOverride);
  const normalized: JwtUserPayload = {
    sub: payload.sub,
    role: payload.role,
    regionId: payload.regionId,
    city: payload.city,
    email: payload.email,
    fullName: payload.fullName?.trim() || payload.email,
    teamId: payload.teamId ?? null,
    teamName: payload.teamName ?? null,
    assignedDistricts: Array.isArray(payload.assignedDistricts)
      ? payload.assignedDistricts.filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
      : [],
  };
  return jwt.sign(normalized, secret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAuthToken(
  token: string,
  secretOverride?: string,
): JwtUserPayload {
  const secret = resolveSecret(secretOverride);
  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
    }) as Partial<JwtUserPayload>;

    if (
      typeof decoded.sub !== 'string' ||
      typeof decoded.role !== 'string' ||
      !VALID_ROLES.has(decoded.role) ||
      typeof decoded.regionId !== 'string' ||
      typeof decoded.city !== 'string' ||
      typeof decoded.email !== 'string'
    ) {
      throw new AppError(
        401,
        'UNAUTHORIZED',
        'Sesi tidak valid atau telah berakhir. Silakan masuk kembali.',
      );
    }

    return {
      sub: decoded.sub,
      role: decoded.role as UserRole,
      regionId: decoded.regionId,
      city: decoded.city,
      email: decoded.email,
      fullName:
        typeof decoded.fullName === 'string' && decoded.fullName.trim().length > 0
          ? decoded.fullName
          : decoded.email,
      teamId: typeof decoded.teamId === 'string' && decoded.teamId ? decoded.teamId : null,
      teamName:
        typeof decoded.teamName === 'string' && decoded.teamName ? decoded.teamName : null,
      assignedDistricts: Array.isArray(decoded.assignedDistricts)
        ? decoded.assignedDistricts.filter(
            (d): d is string => typeof d === 'string' && d.trim().length > 0,
          )
        : [],
    };
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError(
      401,
      'UNAUTHORIZED',
      'Sesi tidak valid atau telah berakhir. Silakan masuk kembali.',
    );
  }
}

export function createAuthenticateMiddleware(secretOverride?: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return next(
        new AppError(
          401,
          'UNAUTHORIZED',
          'Token autentikasi tidak ditemukan. Silakan masuk terlebih dahulu.',
        ),
      );
    }

    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      return next(
        new AppError(
          401,
          'UNAUTHORIZED',
          'Token autentikasi kosong. Silakan masuk kembali.',
        ),
      );
    }

    try {
      req.user = verifyAuthToken(token, secretOverride);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

export const authenticate = createAuthenticateMiddleware();

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(
        new AppError(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan. Silakan masuk kembali.'),
      );
    }
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(
          403,
          'FORBIDDEN_ROLE',
          'Peran akun Anda tidak memiliki izin untuk aksi ini.',
        ),
      );
    }
    return next();
  };
}

export function assertRegionAccess(
  user: JwtUserPayload,
  targetRegionId: string,
): void {
  if (targetRegionId !== user.regionId) {
    throw new AppError(
      403,
      'REGION_ACCESS_DENIED',
      'Anda tidak memiliki akses ke data di luar wilayah tugas Anda.',
    );
  }
}

export function hasDistrictLock(user: JwtUserPayload): boolean {
  return user.role === 'SATPOL_PP' && user.assignedDistricts.length > 0;
}

export function isDistrictAllowed(
  user: JwtUserPayload,
  district: string | null | undefined,
): boolean {
  if (!hasDistrictLock(user)) {
    return true;
  }
  const normalizedTarget = district?.trim().toLowerCase();
  if (!normalizedTarget) {
    return false;
  }
  return user.assignedDistricts.some(
    (allowed) => allowed.trim().toLowerCase() === normalizedTarget,
  );
}

export function assertDistrictAccess(
  user: JwtUserPayload,
  district: string | null | undefined,
  resourceLabel = 'data',
): void {
  if (!isDistrictAllowed(user, district)) {
    throw new AppError(
      403,
      'DISTRICT_ACCESS_DENIED',
      `Anda tidak memiliki akses ke ${resourceLabel} di luar wilayah kecamatan tugas tim Anda.`,
    );
  }
}

export function formatActorName(user: JwtUserPayload): string {
  const baseName = user.fullName?.trim() || user.email;
  if (user.teamName?.trim()) {
    return `${baseName} (${user.teamName.trim()})`;
  }
  return baseName;
}

export function enforceRegionScope(
  resolveTargetRegionId: (req: Request) => Promise<string | null> | string | null,
) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(
        new AppError(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan. Silakan masuk kembali.'),
      );
    }
    try {
      const targetRegionId = await resolveTargetRegionId(req);
      if (targetRegionId !== null) {
        assertRegionAccess(req.user, targetRegionId);
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}
