import type { Request, Response } from 'express';
import type { CreateZoneInput, UpdateZoneInput } from '../interface/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import ZoneService from '../service/zone.service.js';

export function createZoneController(service = ZoneService) {
  return {
    async list(req: Request, res: Response) {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan.');
      }
      const zones = await service.listByRegion(req.user);
      return res.status(200).json({ ok: true, data: { zones } });
    },

    async create(req: Request, res: Response) {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan.');
      }
      const input = res.locals.validatedBody as CreateZoneInput;
      const zone = await service.create(req.user, input);
      return res.status(201).json({ ok: true, data: { zone } });
    },

    async update(req: Request, res: Response) {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan.');
      }
      const input = res.locals.validatedBody as UpdateZoneInput;
      const zone = await service.update(req.user, String(req.params.id), input);
      return res.status(200).json({ ok: true, data: { zone } });
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

export const ZoneController = createZoneController();
export default ZoneController;
