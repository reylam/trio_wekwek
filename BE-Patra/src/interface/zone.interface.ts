import { z } from 'zod';
import { geoPolygonPointsSchema, type GeoLngLat } from './common.interface.js';

export const createZoneSchema = z.object({
  name: z.string().trim().min(2, 'Nama zona minimal 2 karakter.').max(150),
  description: z.string().trim().max(500).nullable().optional(),
  district: z.string().trim().min(1, 'Nama kecamatan minimal 1 karakter.').max(120).nullable().optional(),
  points: geoPolygonPointsSchema,
});

export type CreateZoneInput = z.infer<typeof createZoneSchema>;

export const updateZoneSchema = createZoneSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Minimal satu field zona harus diisi untuk pembaruan.',
  });

export type UpdateZoneInput = z.infer<typeof updateZoneSchema>;

export interface RestrictedZoneDto {
  id: string;
  regionId: string;
  district: string | null;
  name: string;
  description: string | null;
  points: GeoLngLat[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
