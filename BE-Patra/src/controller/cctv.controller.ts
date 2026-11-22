import type { Request, Response } from 'express';
import type { CctvQueryParams, UpdateCctvRoiInput } from '../interface/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import CctvService from '../service/cctv.service.js';

export function createCctvController(service = CctvService) {
  return {
    async list(req: Request, res: Response) {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan.');
      }
      const query = (res.locals.validatedQuery ?? {}) as CctvQueryParams;
      const result = await service.listByRegion(req.user, query);

      // Edge cache sesuai LOCKED DECISION: katalog dari DB bukan live scraping.
      res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=60');
      res.setHeader('Vary', 'Authorization');

      return res.status(200).json({
        ok: true,
        data: { cameras: result.cameras },
        meta: result.meta,
      });
    },

    async getById(req: Request, res: Response) {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan.');
      }
      const camera = await service.getById(req.user, String(req.params.id));
      return res.status(200).json({ ok: true, data: { camera } });
    },

    async updateRoi(req: Request, res: Response) {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan.');
      }
      const input = res.locals.validatedBody as UpdateCctvRoiInput;
      const camera = await service.updateRoi(req.user, String(req.params.id), input);
      return res.status(200).json({ ok: true, data: { camera } });
    },
  };
}

export const CctvController = createCctvController();
export default CctvController;
