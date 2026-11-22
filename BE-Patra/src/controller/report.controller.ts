import type { Request, Response } from 'express';
import type {
  AutoDetectPayload,
  ListReportsQuery,
  SubmitReportActionInput,
} from '../interface/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import ReportService from '../service/report.service.js';

export function createReportController(service = ReportService) {
  return {
    async autoDetect(req: Request, res: Response) {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan.');
      }
      const payload = res.locals.validatedBody as AutoDetectPayload;
      const result = await service.autoDetect(req.user, payload, req.file);
      return res.status(result.statusCode).json({
        ok: true,
        data: result.data,
      });
    },

    async list(req: Request, res: Response) {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan.');
      }
      const query = res.locals.validatedQuery as ListReportsQuery;
      const result = await service.listByRegion(req.user, query);
      return res.status(200).json({
        ok: true,
        data: { reports: result.reports },
        meta: { pagination: result.pagination },
      });
    },

    async getById(req: Request, res: Response) {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan.');
      }
      const report = await service.getDetailById(req.user, String(req.params.id));
      return res.status(200).json({
        ok: true,
        data: { report },
      });
    },

    async submitAction(req: Request, res: Response) {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan.');
      }
      const input = res.locals.validatedBody as SubmitReportActionInput;
      const report = await service.submitAction(
        req.user,
        String(req.params.id),
        input,
        req.file,
      );
      return res.status(200).json({
        ok: true,
        data: { report },
      });
    },
  };
}

export const ReportController = createReportController();
export default ReportController;
