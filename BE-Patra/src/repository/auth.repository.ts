import { getPrisma } from '../config/prisma.js';
import type { PatrolTeamDto, UserRole } from '../interface/index.js';

export interface UserWithRegionRecord {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  noTelp: string | null;
  role: UserRole;
  isDemo: boolean;
  demoKey: string | null;
  team: PatrolTeamDto | null;
  region: {
    id: string;
    code: string;
    city: string;
    province: string;
    satpolAgencyName: string;
    umkmAgencyName: string;
    centerLat: number;
    centerLng: number;
    defaultZoom: number;
  };
}

const regionSelect = {
  id: true,
  code: true,
  city: true,
  province: true,
  satpolAgencyName: true,
  umkmAgencyName: true,
  centerLat: true,
  centerLng: true,
  defaultZoom: true,
} as const;

const teamSelect = {
  id: true,
  code: true,
  name: true,
  assignedDistricts: true,
} as const;

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    : [];
}

function mapUserRecord(row: {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  noTelp: string | null;
  role: string;
  isDemo: boolean;
  demoKey: string | null;
  team: {
    id: string;
    code: string;
    name: string;
    assignedDistricts: unknown;
  } | null;
  region: UserWithRegionRecord['region'];
}): UserWithRegionRecord {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    fullName: row.fullName,
    noTelp: row.noTelp,
    role: row.role as UserRole,
    isDemo: row.isDemo,
    demoKey: row.demoKey,
    team: row.team
      ? {
          id: row.team.id,
          code: row.team.code,
          name: row.team.name,
          assignedDistricts: toStringArray(row.team.assignedDistricts),
        }
      : null,
    region: row.region,
  };
}

export const AuthRepository = {
  async findByEmailWithRegion(email: string): Promise<UserWithRegionRecord | null> {
    const prisma = getPrisma();
    const row = await prisma.user.findFirst({
      where: {
        email: { equals: email.trim(), mode: 'insensitive' },
      },
      include: {
        region: { select: regionSelect },
        team: { select: teamSelect },
      },
    });
    return row ? mapUserRecord(row) : null;
  },

  async findDemoByKeyWithRegion(demoKey: string): Promise<UserWithRegionRecord | null> {
    const prisma = getPrisma();
    const row = await prisma.user.findFirst({
      where: {
        demoKey: demoKey.trim(),
        isDemo: true,
      },
      include: {
        region: { select: regionSelect },
        team: { select: teamSelect },
      },
    });
    return row ? mapUserRecord(row) : null;
  },

  async findByIdWithRegion(id: string): Promise<UserWithRegionRecord | null> {
    const prisma = getPrisma();
    const row = await prisma.user.findUnique({
      where: { id },
      include: {
        region: { select: regionSelect },
        team: { select: teamSelect },
      },
    });
    return row ? mapUserRecord(row) : null;
  },

  async updateNoTelp(id: string, noTelp: string): Promise<UserWithRegionRecord> {
    const prisma = getPrisma();
    const row = await prisma.user.update({
      where: { id },
      data: { noTelp },
      include: {
        region: { select: regionSelect },
        team: { select: teamSelect },
      },
    });
    return mapUserRecord(row);
  },
};

export type AuthRepositoryPort = typeof AuthRepository;
export default AuthRepository;
