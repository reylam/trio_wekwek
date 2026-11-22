import { z } from 'zod';
import type { RegionDto, UserRole } from './common.interface.js';

export const loginSchema = z.object({
  email: z.string().trim().email('Format email tidak valid.'),
  password: z.string().min(1, 'Kata sandi wajib diisi.'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const demoLoginSchema = z.object({
  demoKey: z.string().trim().min(1, 'demoKey wajib diisi.'),
});

export type DemoLoginInput = z.infer<typeof demoLoginSchema>;

export interface JwtUserPayload {
  sub: string;
  role: UserRole;
  regionId: string;
  city: string;
  email: string;
}

export interface AuthUserDto {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isDemo: boolean;
  region: RegionDto;
}

export interface AuthLoginResponseData {
  token: string;
  user: AuthUserDto;
}
