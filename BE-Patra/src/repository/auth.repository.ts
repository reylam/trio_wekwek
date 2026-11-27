import { getPrisma } from '../config/prisma.js';
import type { UserRole } from '../interface/index.js';

export interface UserWithRegionRecord {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  noTelp: string | null;
  role: UserRole;
  isDemo: boolean;
  demoKey: string | null;
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

export const AuthRepository = {
  async findByEmailWithRegion(email: string): Promise<UserWithRegionRecord | null> {
    const prisma = getPrisma();
    return prisma.user.findFirst({
      where: {
        email: { equals: email.trim(), mode: 'insensitive' },
      },
      include: { region: { select: regionSelect } },
    });
  },

  async findDemoByKeyWithRegion(demoKey: string): Promise<UserWithRegionRecord | null> {
    const prisma = getPrisma();
    return prisma.user.findFirst({
      where: {
        demoKey: demoKey.trim(),
        isDemo: true,
      },
      include: { region: { select: regionSelect } },
    });
  },

  async findByIdWithRegion(id: string): Promise<UserWithRegionRecord | null> {
    const prisma = getPrisma();
    return prisma.user.findUnique({
      where: { id },
      include: { region: { select: regionSelect } },
    });
  },

  async updateNoTelp(id: string, noTelp: string): Promise<UserWithRegionRecord> {
    const prisma = getPrisma();
    return prisma.user.update({
      where: { id },
      data: { noTelp },
      include: { region: { select: regionSelect } },
    });
  },
};

export type AuthRepositoryPort = typeof AuthRepository;
export default AuthRepository;
