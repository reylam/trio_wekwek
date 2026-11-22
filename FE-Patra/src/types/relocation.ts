// STRICT OUT-OF-SCOPE: Dilarang keras menambahkan field kuota/kapasitas lapak.
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

export interface CreateRelocationSiteInput {
  name: string;
  address: string;
  lat: number;
  lng: number;
  tradeCategories: string[];
  facilities: string[];
}

export interface UpdateRelocationSiteInput {
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
  tradeCategories?: string[];
  facilities?: string[];
}
