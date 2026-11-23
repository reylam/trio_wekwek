import express from 'express';
import {
  publicAuditFeedQuerySchema,
  publicCityQuerySchema,
} from '../interface/index.js';
import { validateQuery } from '../middlewares/validate.js';
import PublicController, {
  createPublicController,
} from '../controller/public.controller.js';

export function createPublicRouter(options?: {
  controller?: ReturnType<typeof createPublicController>;
}) {
  const router = express.Router();
  const controller = options?.controller ?? PublicController;

  // Portal Publik: Tanpa login, dilarang mengembalikan URL foto mentah.
  router.get('/cities', controller.listCities);
  router.get('/overview', validateQuery(publicCityQuerySchema), controller.getOverview);
  router.get('/map', validateQuery(publicCityQuerySchema), controller.getMap);
  router.get(
    '/audit-feed',
    validateQuery(publicAuditFeedQuerySchema),
    controller.getAuditFeed,
  );

  return router;
}

export default createPublicRouter();
