import type { Request, Response } from 'express';
import type {
  CreateRelocationSiteInput,
  UpdateRelocationSiteInput,
} from '../interface/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import RelocationSiteService from '../service/relocationSite.service.js';

export function createRelocationSiteController(service = RelocationSiteService) {
  return {
    async list(req: Request, res: Response) {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan.');
      }
      const relocationSites = await service.listByRegion(req.user);
      return res.status(200).json({ ok: true, data: { relocationSites } });
    },

    async create(req: Request, res: Response) {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan.');
      }
      const input = res.locals.validatedBody as CreateRelocationSiteInput;
      const relocationSite = await service.create(req.user, input);
      return res.status(201).json({ ok: true, data: { relocationSite } });
    },

    async update(req: Request, res: Response) {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan.');
      }
      const input = res.locals.validatedBody as UpdateRelocationSiteInput;
      const relocationSite = await service.update(
        req.user,
        String(req.params.id),
        input,
      );
      return res.status(200).json({ ok: true, data: { relocationSite } });
    },

    async remove(req: Request, res: Response) {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan.');
      }
      const data = await service.remove(req.user, String(req.params.id));
      return res.status(200).json({ ok: true, data });
    },
  };
}

export const RelocationSiteController = createRelocationSiteController();
export default RelocationSiteController;
