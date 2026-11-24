import express from 'express';
import {
  assignRelocationSchema,
  autoDetectPayloadSchema,
  listReportsQuerySchema,
  submitReportActionSchema,
  validateReportSchema,
} from '../interface/index.js';
import {
  authenticate,
  createAuthenticateMiddleware,
  requireRole,
} from '../middlewares/auth.js';
import photoUpload, { validateImageMagicBytes } from '../middlewares/upload.js';
import { createAutoDetectRateLimiter } from '../middlewares/security.js';
import {
  validateBody,
  validateMultipartPayload,
  validateQuery,
} from '../middlewares/validate.js';
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
  const autoDetectLimiter = createAutoDetectRateLimiter();

  router.post(
    '/auto-detect',
    authGuard,
    requireRole('SATPOL_PP'),
    autoDetectLimiter,
    photoUpload.single('snapshot'),
    validateImageMagicBytes,
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
    validateImageMagicBytes,
    validateMultipartPayload(submitReportActionSchema),
    controller.submitAction,
  );

  router.post(
    '/:id/validate',
    authGuard,
    requireRole('DINAS_UMKM'),
    validateBody(validateReportSchema),
    controller.validate,
  );

  router.post(
    '/:id/relocation',
    authGuard,
    requireRole('DINAS_UMKM'),
    validateBody(assignRelocationSchema),
    controller.assignRelocation,
  );

  router.get(
    '/:id/pdf',
    authGuard,
    requireRole('DINAS_UMKM', 'SATPOL_PP'),
    controller.downloadPdf,
  );

  return router;
}

export default createReportRouter();
