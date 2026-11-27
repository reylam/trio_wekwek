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

export const updateProfilePhoneSchema = z.object({
  noTelp: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, ' '))
    .refine((v) => /^[+]?[0-9\s-]+$/.test(v), {
      message: 'Nomor telepon hanya boleh berisi angka, spasi, tanda +, atau -.',
    })
    .refine(
      (v) => {
        const digits = v.replace(/\D/g, '');
        return digits.length >= 8 && digits.length <= 15;
      },
      { message: 'Nomor telepon harus terdiri dari 8–15 digit.' },
    ),
});

export type UpdateProfilePhoneInput = z.infer<typeof updateProfilePhoneSchema>;

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
  noTelp: string | null;
  role: UserRole;
  isDemo: boolean;
  region: RegionDto;
}

export interface AuthLoginResponseData {
  token: string;
  user: AuthUserDto;
}
