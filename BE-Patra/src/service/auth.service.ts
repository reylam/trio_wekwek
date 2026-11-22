import bcrypt from 'bcryptjs';
import config from '../config/config.js';
import type {
  AuthLoginResponseData,
  AuthUserDto,
  DemoLoginInput,
  LoginInput,
} from '../interface/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import { signAuthToken } from '../middlewares/auth.js';
import AuthRepository, {
  type AuthRepositoryPort,
  type UserWithRegionRecord,
} from '../repository/auth.repository.js';

export function mapUserToAuthDto(record: UserWithRegionRecord): AuthUserDto {
  return {
    id: record.id,
    email: record.email,
    fullName: record.fullName,
    role: record.role,
    isDemo: record.isDemo,
    region: {
      id: record.region.id,
      code: record.region.code,
      city: record.region.city,
      province: record.region.province,
      satpolAgencyName: record.region.satpolAgencyName,
      umkmAgencyName: record.region.umkmAgencyName,
      centerLat: record.region.centerLat,
      centerLng: record.region.centerLng,
      defaultZoom: record.region.defaultZoom,
    },
  };
}

function buildLoginResult(
  record: UserWithRegionRecord,
  jwtSecretOverride?: string,
): AuthLoginResponseData {
  const user = mapUserToAuthDto(record);
  const token = signAuthToken(
    {
      sub: user.id,
      role: user.role,
      regionId: user.region.id,
      city: user.region.city,
      email: user.email,
    },
    jwtSecretOverride,
  );
  return { token, user };
}

export interface AuthServiceOptions {
  enableDemoLogin?: boolean;
  jwtSecret?: string;
}

export function createAuthService(
  repo: AuthRepositoryPort = AuthRepository,
  options: AuthServiceOptions = {},
) {
  const isDemoEnabled = () => options.enableDemoLogin ?? config.enableDemoLogin;

  return {
    async login(input: LoginInput): Promise<AuthLoginResponseData> {
      const record = await repo.findByEmailWithRegion(input.email);
      // Pesan kesalahan sengaja generik agar tidak membocorkan keberadaan email.
      if (!record) {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Email atau kata sandi tidak sesuai.');
      }

      const validPassword = await bcrypt.compare(input.password, record.passwordHash);
      if (!validPassword) {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Email atau kata sandi tidak sesuai.');
      }

      return buildLoginResult(record, options.jwtSecret);
    },

    async demoLogin(input: DemoLoginInput): Promise<AuthLoginResponseData> {
      if (!isDemoEnabled()) {
        throw new AppError(
          403,
          'DEMO_LOGIN_DISABLED',
          'Akses demo 1-klik sedang dinonaktifkan pada server.',
        );
      }

      const record = await repo.findDemoByKeyWithRegion(input.demoKey);
      if (!record) {
        throw new AppError(
          404,
          'DEMO_ACCOUNT_NOT_FOUND',
          `Akun demo dengan kunci "${input.demoKey}" tidak ditemukan.`,
        );
      }

      return buildLoginResult(record, options.jwtSecret);
    },

    async getMe(userId: string): Promise<AuthUserDto> {
      const record = await repo.findByIdWithRegion(userId);
      if (!record) {
        throw new AppError(
          401,
          'UNAUTHORIZED',
          'Akun tidak ditemukan atau sesi tidak lagi valid.',
        );
      }
      return mapUserToAuthDto(record);
    },
  };
}

export const AuthService = createAuthService();
export default AuthService;
