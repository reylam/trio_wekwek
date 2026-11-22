import type { Request, Response } from 'express';
import { AppError } from '../middlewares/errorHandler.js';
import DinasService from '../service/dinas.service.js';

export function createDinasController(service = DinasService) {
  return {
    async analytics(req: Request, res: Response) {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan.');
      }
      const data = await service.getAnalytics(req.user);
      return res.status(200).json({ ok: true, data });
    },
  };
}

export const DinasController = createDinasController();
export default DinasController;
