import type { Request, Response } from 'express';
import type {
  AssignRelocationInput,
  AutoDetectPayload,
  ListReportsQuery,
  SubmitReportActionInput,
  ValidateReportInput,
} from '../interface/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import PdfBeritaAcaraService from '../service/pdfBeritaAcara.service.js';
import ReportService from '../service/report.service.js';

export function createReportController(
  service = ReportService,
  pdfService = PdfBeritaAcaraService,
) {
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

    async validate(req: Request, res: Response) {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan.');
      }
      const input = res.locals.validatedBody as ValidateReportInput;
      const report = await service.validate(req.user, String(req.params.id), input);
      return res.status(200).json({
        ok: true,
        data: { report },
      });
    },

    async assignRelocation(req: Request, res: Response) {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan.');
      }
      const input = res.locals.validatedBody as AssignRelocationInput;
      const report = await service.assignRelocation(
        req.user,
        String(req.params.id),
        input,
      );
      return res.status(200).json({
        ok: true,
        data: { report },
      });
    },

    async downloadPdf(req: Request, res: Response) {
      if (!req.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Sesi tidak ditemukan.');
      }
      // Siapkan konteks & akses SEBELUM mengirim header PDF agar error tetap masuk errorHandler JSON
      const prepared = await pdfService.prepare(req.user, String(req.params.id));
      const isInline = req.query.inline === '1' || req.query.inline === 'true';

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${isInline ? 'inline' : 'attachment'}; filename="${prepared.filename}"`,
      );
      res.setHeader('Cache-Control', 'no-store');
      await prepared.render(res);
    },
  };
}

export const ReportController = createReportController();
export default ReportController;
