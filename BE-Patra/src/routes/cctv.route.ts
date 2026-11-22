import express from 'express';
import { cctvQuerySchema, updateCctvRoiSchema } from '../interface/index.js';
import {
  authenticate,
  createAuthenticateMiddleware,
  requireRole,
} from '../middlewares/auth.js';
import { validateBody, validateQuery } from '../middlewares/validate.js';
import CctvController, { createCctvController } from '../controller/cctv.controller.js';

export function createCctvRouter(options?: {
  controller?: ReturnType<typeof createCctvController>;
  jwtSecret?: string;
}) {
  const router = express.Router();
  const controller = options?.controller ?? CctvController;
  const authGuard = options?.jwtSecret
    ? createAuthenticateMiddleware(options.jwtSecret)
    : authenticate;

  router.use(authGuard, requireRole('SATPOL_PP'));

  router.get('/', validateQuery(cctvQuerySchema), controller.list);
  router.get('/:id', controller.getById);
  router.patch('/:id/roi', validateBody(updateCctvRoiSchema), controller.updateRoi);

  return router;
}

export default createCctvRouter();
