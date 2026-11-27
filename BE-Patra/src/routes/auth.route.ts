import express from 'express';
import {
  demoLoginSchema,
  loginSchema,
  updateProfilePhoneSchema,
} from '../interface/index.js';
import { authenticate, createAuthenticateMiddleware } from '../middlewares/auth.js';
import { validateBody } from '../middlewares/validate.js';
import AuthController, { createAuthController } from '../controller/auth.controller.js';

export function createAuthRouter(options?: {
  controller?: ReturnType<typeof createAuthController>;
  jwtSecret?: string;
}) {
  const router = express.Router();
  const controller = options?.controller ?? AuthController;
  const authGuard = options?.jwtSecret
    ? createAuthenticateMiddleware(options.jwtSecret)
    : authenticate;

  router.post('/login', validateBody(loginSchema), controller.login);
  router.post('/demo-login', validateBody(demoLoginSchema), controller.demoLogin);
  router.get('/me', authGuard, controller.me);
  router.patch('/me', authGuard, validateBody(updateProfilePhoneSchema), controller.updateMe);
  router.post('/logout', authGuard, controller.logout);

  return router;
}

export default createAuthRouter();
