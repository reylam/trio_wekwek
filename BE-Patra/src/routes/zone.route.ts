import express from 'express';
import { createZoneSchema, updateZoneSchema } from '../interface/index.js';
import {
  authenticate,
  createAuthenticateMiddleware,
  requireRole,
} from '../middlewares/auth.js';
import { validateBody } from '../middlewares/validate.js';
import ZoneController, { createZoneController } from '../controller/zone.controller.js';

export function createZoneRouter(options?: {
  controller?: ReturnType<typeof createZoneController>;
  jwtSecret?: string;
}) {
  const router = express.Router();
  const controller = options?.controller ?? ZoneController;
  const authGuard = options?.jwtSecret
    ? createAuthenticateMiddleware(options.jwtSecret)
    : authenticate;

  router.get('/', authGuard, requireRole('SATPOL_PP', 'DINAS_UMKM'), controller.list);
  router.post(
    '/',
    authGuard,
    requireRole('SATPOL_PP'),
    validateBody(createZoneSchema),
    controller.create,
  );
  router.patch(
    '/:id',
    authGuard,
    requireRole('SATPOL_PP'),
    validateBody(updateZoneSchema),
    controller.update,
  );
  router.delete('/:id', authGuard, requireRole('SATPOL_PP'), controller.remove);

  return router;
}

export default createZoneRouter();
