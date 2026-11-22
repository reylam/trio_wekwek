import type { GeoLngLat } from './common';

export interface RestrictedZoneDto {
  id: string;
  regionId: string;
  name: string;
  description: string | null;
  points: GeoLngLat[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateZoneInput {
  name: string;
  description?: string | null;
  points: GeoLngLat[];
}

export interface UpdateZoneInput {
  name?: string;
  description?: string | null;
  points?: GeoLngLat[];
}
