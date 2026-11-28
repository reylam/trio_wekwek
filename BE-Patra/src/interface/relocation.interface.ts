import { z } from 'zod';
import {
  latitudeSchema,
  longitudeSchema,
  type SiteCapacityMetrics,
} from './common.interface.js';

const relocationSiteBaseFields = {
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
};

const maxCapacitySchema = z
  .number()
  .int('Kapasitas maksimal harus bilangan bulat.')
  .min(1, 'Kapasitas maksimal minimal 1.')
  .max(5000, 'Kapasitas maksimal terlalu besar.');

const occupiedCapacitySchema = z
  .number()
  .int('Jumlah terisi harus bilangan bulat.')
  .min(0, 'Jumlah terisi minimal 0.')
  .max(5000, 'Jumlah terisi terlalu besar.');

export const createRelocationSiteSchema = z
  .object({
    ...relocationSiteBaseFields,
    maxCapacity: maxCapacitySchema.default(20),
    occupiedCapacity: occupiedCapacitySchema.default(0),
  })
  .refine((data) => data.occupiedCapacity <= data.maxCapacity, {
    path: ['occupiedCapacity'],
    message: 'Jumlah terisi tidak boleh melebihi kapasitas maksimal.',
  });

export type CreateRelocationSiteInput = z.infer<typeof createRelocationSiteSchema>;

export const updateRelocationSiteSchema = z
  .object({
    ...relocationSiteBaseFields,
    maxCapacity: maxCapacitySchema,
    occupiedCapacity: occupiedCapacitySchema,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Minimal satu field lokasi binaan harus diisi untuk pembaruan.',
  })
  .refine(
    (data) =>
      data.maxCapacity === undefined ||
      data.occupiedCapacity === undefined ||
      data.occupiedCapacity <= data.maxCapacity,
    {
      path: ['occupiedCapacity'],
      message: 'Jumlah terisi tidak boleh melebihi kapasitas maksimal.',
    },
  );

export type UpdateRelocationSiteInput = z.infer<typeof updateRelocationSiteSchema>;

export interface RelocationSiteDto extends SiteCapacityMetrics {
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

export interface NearestRelocationSiteDto extends SiteCapacityMetrics {
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
