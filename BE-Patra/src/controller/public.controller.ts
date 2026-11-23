import type { Request, Response } from 'express';
import type { PublicAuditFeedQuery, PublicCityQuery } from '../interface/index.js';
import PublicService from '../service/public.service.js';

export function createPublicController(service = PublicService) {
  return {
    async listCities(_req: Request, res: Response) {
      const cities = await service.listCities();
      res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=60');
      return res.status(200).json({ ok: true, data: { cities } });
    },

    async getOverview(_req: Request, res: Response) {
      const query = (res.locals.validatedQuery ?? {}) as PublicCityQuery;
      const data = await service.getOverview(query.city);
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
      return res.status(200).json({ ok: true, data });
    },

    async getMap(_req: Request, res: Response) {
      const query = (res.locals.validatedQuery ?? {}) as PublicCityQuery;
      const data = await service.getMap(query.city);
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
      return res.status(200).json({ ok: true, data });
    },

    async getAuditFeed(_req: Request, res: Response) {
      const query = res.locals.validatedQuery as PublicAuditFeedQuery;
      const result = await service.getAuditFeed(query);
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
      return res.status(200).json({
        ok: true,
        data: { items: result.items },
        meta: result.meta,
      });
    },
  };
}

export const PublicController = createPublicController();
export default PublicController;
