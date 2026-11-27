import type { Request, Response } from 'express';
import type {
  DemoLoginInput,
  LoginInput,
  UpdateProfilePhoneInput,
} from '../interface/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import AuthService from '../service/auth.service.js';

export function createAuthController(service = AuthService) {
  return {
    async login(_req: Request, res: Response) {
      const input = res.locals.validatedBody as LoginInput;
      const data = await service.login(input);
      return res.status(200).json({ ok: true, data });
    },

    async demoLogin(_req: Request, res: Response) {
      const input = res.locals.validatedBody as DemoLoginInput;
      const data = await service.demoLogin(input);
      return res.status(200).json({ ok: true, data });
    },

    async me(req: Request, res: Response) {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan.');
      }
      const user = await service.getMe(req.user.sub);
      return res.status(200).json({ ok: true, data: { user } });
    },

    async updateMe(req: Request, res: Response) {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan.');
      }
      const input = res.locals.validatedBody as UpdateProfilePhoneInput;
      const user = await service.updateMyPhone(req.user.sub, input);
      return res.status(200).json({ ok: true, data: { user } });
    },

    async logout(_req: Request, res: Response) {
      return res.status(200).json({ ok: true, data: { loggedOut: true } });
    },
  };
}

export const AuthController = createAuthController();
export default AuthController;
