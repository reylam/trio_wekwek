import type { RegionDto, UserRole } from './common';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface DemoLoginRequest {
  demoKey: string;
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
