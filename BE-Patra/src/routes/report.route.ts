import express from 'express';
import {
  autoDetectPayloadSchema,
  listReportsQuerySchema,
  submitReportActionSchema,
} from '../interface/index.js';
import {
  authenticate,
  createAuthenticateMiddleware,
  requireRole,
} from '../middlewares/auth.js';
import photoUpload from '../middlewares/upload.js';
import { validateMultipartPayload, validateQuery } from '../middlewares/validate.js';
import ReportController, {
  createReportController,
} from '../controller/report.controller.js';

export function createReportRouter(options?: {
  controller?: ReturnType<typeof createReportController>;
  jwtSecret?: string;
}) {
  const router = express.Router();
  const controller = options?.controller ?? ReportController;
  const authGuard = options?.jwtSecret
    ? createAuthenticateMiddleware(options.jwtSecret)
    : authenticate;

  router.post(
    '/auto-detect',
    authGuard,
    requireRole('SATPOL_PP'),
    photoUpload.single('snapshot'),
    validateMultipartPayload(autoDetectPayloadSchema),
    controller.autoDetect,
  );

  router.get(
    '/',
    authGuard,
    requireRole('SATPOL_PP', 'DINAS_UMKM'),
    validateQuery(listReportsQuerySchema),
    controller.list,
  );

  router.get(
    '/:id',
    authGuard,
    requireRole('SATPOL_PP', 'DINAS_UMKM'),
    controller.getById,
  );

  router.post(
    '/:id/action',
    authGuard,
    requireRole('SATPOL_PP'),
    photoUpload.single('afterPhoto'),
    validateMultipartPayload(submitReportActionSchema),
    controller.submitAction,
  );

  return router;
}

export default createReportRouter();
