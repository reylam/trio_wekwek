import { z } from 'zod';
import { latitudeSchema, longitudeSchema } from './common.interface.js';

// STRICT OUT-OF-SCOPE: Dilarang keras menambahkan field kuota/kapasitas lapak.
export const createRelocationSiteSchema = z.object({
  name: z.string().trim().min(2, 'Nama lokasi binaan minimal 2 karakter.').max(180),
  address: z.string().trim().min(5, 'Alamat lengkap minimal 5 karakter.').max(400),
  lat: latitudeSchema,
  lng: longitudeSchema,
  tradeCategories: z
    .array(z.string().trim().min(1))
    .min(1, 'Minimal 1 kategori dagangan wajib diisi.'),
  facilities: z
    .array(z.string().trim().min(1))
    .min(1, 'Minimal 1 fasilitas wajib diisi.'),
});

export type CreateRelocationSiteInput = z.infer<typeof createRelocationSiteSchema>;

export const updateRelocationSiteSchema = createRelocationSiteSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Minimal satu field lokasi binaan harus diisi untuk pembaruan.',
  });

export type UpdateRelocationSiteInput = z.infer<typeof updateRelocationSiteSchema>;

export interface RelocationSiteDto {
  id: string;
  regionId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  tradeCategories: string[];
  facilities: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NearestRelocationSiteDto {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  tradeCategories: string[];
  facilities: string[];
  distanceMeters: number;
  distanceLabel: string;
}
