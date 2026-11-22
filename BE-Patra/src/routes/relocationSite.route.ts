import express from 'express';
import {
  createRelocationSiteSchema,
  updateRelocationSiteSchema,
} from '../interface/index.js';
import {
  authenticate,
  createAuthenticateMiddleware,
  requireRole,
} from '../middlewares/auth.js';
import { validateBody } from '../middlewares/validate.js';
import RelocationSiteController, {
  createRelocationSiteController,
} from '../controller/relocationSite.controller.js';

export function createRelocationSiteRouter(options?: {
  controller?: ReturnType<typeof createRelocationSiteController>;
  jwtSecret?: string;
}) {
  const router = express.Router();
  const controller = options?.controller ?? RelocationSiteController;
  const authGuard = options?.jwtSecret
    ? createAuthenticateMiddleware(options.jwtSecret)
    : authenticate;

  router.get(
    '/',
    authGuard,
    requireRole('DINAS_UMKM', 'SATPOL_PP'),
    controller.list,
  );
  router.post(
    '/',
    authGuard,
    requireRole('DINAS_UMKM'),
    validateBody(createRelocationSiteSchema),
    controller.create,
  );
  router.patch(
    '/:id',
    authGuard,
    requireRole('DINAS_UMKM'),
    validateBody(updateRelocationSiteSchema),
    controller.update,
  );
  router.delete(
    '/:id',
    authGuard,
    requireRole('DINAS_UMKM'),
    controller.remove,
  );

  return router;
}

export default createRelocationSiteRouter();
