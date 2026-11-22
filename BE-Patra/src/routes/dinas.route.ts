import express from 'express';
import {
  authenticate,
  createAuthenticateMiddleware,
  requireRole,
} from '../middlewares/auth.js';
import DinasController, {
  createDinasController,
} from '../controller/dinas.controller.js';

export function createDinasRouter(options?: {
  controller?: ReturnType<typeof createDinasController>;
  jwtSecret?: string;
}) {
  const router = express.Router();
  const controller = options?.controller ?? DinasController;
  const authGuard = options?.jwtSecret
    ? createAuthenticateMiddleware(options.jwtSecret)
    : authenticate;

  router.get(
    '/analytics',
    authGuard,
    requireRole('DINAS_UMKM'),
    controller.analytics,
  );

  return router;
}

export default createDinasRouter();
