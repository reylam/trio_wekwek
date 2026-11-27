import { apiFetch, getOfflinePreviewDemoKey, getStoredToken } from '@/lib/apiClient';
import { offlineMock } from '@/services/offlineMock';
import type {
  AuthLoginResponseData,
  AuthUserDto,
  AutoDetectPayload,
  AutoDetectResponseData,
  CctvCameraDto,
  CreateZoneInput,
  NormalizedPolygon,
  ReportStatus,
  RestrictedZoneDto,
  SubmitReportActionPayload,
  UpdateZoneInput,
  ViolationReportDetailDto,
  ViolationReportDto,
} from '@/types';

// FE standalone mode (belum dihubungkan ke BE-Patra).
// Set VITE_USE_BACKEND="true" di .env saat siap mengaktifkan integrasi BE-Patra.
export const IS_BACKEND_ENABLED = import.meta.env.VITE_USE_BACKEND === 'true';

function getMockSessionUser(): AuthUserDto | null {
  const key = getOfflinePreviewDemoKey();
  if (key) return offlineMock.getUserByDemoKey(key);

  const token = getStoredToken();
  if (token?.startsWith('mock:')) {
    return offlineMock.getUserByDemoKey(token.slice('mock:'.length));
  }

  return IS_BACKEND_ENABLED ? null : offlineMock.getUserByDemoKey('satpol-semarang');
}

export const authApi = {
  async login(email: string, password: string): Promise<AuthLoginResponseData> {
    if (!IS_BACKEND_ENABLED) {
      if (!email.trim() || !password) {
        throw new Error('Email dan kata sandi wajib diisi.');
      }
      return offlineMock.loginByEmail(email);
    }

    const res = await apiFetch<AuthLoginResponseData>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      skipAuth: true,
    });
    return res.data;
  },

  async demoLogin(demoKey: string): Promise<AuthLoginResponseData> {
    if (!IS_BACKEND_ENABLED) {
      return {
        token: `mock:${demoKey}`,
        user: offlineMock.getUserByDemoKey(demoKey),
      };
    }

    const res = await apiFetch<AuthLoginResponseData>('/api/auth/demo-login', {
      method: 'POST',
      body: { demoKey },
      skipAuth: true,
    });
    return res.data;
  },

  async me(): Promise<AuthUserDto> {
    if (!IS_BACKEND_ENABLED) {
      const mockUser = getMockSessionUser();
      if (!mockUser) throw new Error('Sesi tidak ditemukan.');
      return mockUser;
    }

    const res = await apiFetch<{ user: AuthUserDto }>('/api/auth/me');
    return res.data.user;
  },

  async updatePhoneNumber(noTelp: string): Promise<AuthUserDto> {
    if (!IS_BACKEND_ENABLED) {
      const mockUser = getMockSessionUser();
      if (!mockUser) throw new Error('Sesi tidak ditemukan.');
      return { ...mockUser, noTelp };
    }

    const res = await apiFetch<{ user: AuthUserDto }>('/api/auth/me', {
      method: 'PATCH',
      body: { noTelp },
    });
    return res.data.user;
  },

  async logout(): Promise<void> {
    if (!IS_BACKEND_ENABLED) return;
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Tetap lanjutkan pembersihan sesi klien saat logout
    }
  },
};

export const cctvApi = {
  async list(params?: {
    search?: string;
    district?: string;
    facilityCategory?: string;
  }): Promise<{ cameras: CctvCameraDto[]; total: number; city: string }> {
    if (!IS_BACKEND_ENABLED) {
      await offlineMock.ensureCamerasLoaded();
      const mockUser = getMockSessionUser()!;
      const cameras = offlineMock.listCameras(mockUser, params);
      return { cameras, total: cameras.length, city: mockUser.region.city };
    }

    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.district) qs.set('district', params.district);
    if (params?.facilityCategory) qs.set('category', params.facilityCategory);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';

    const res = await apiFetch<
      { cameras: CctvCameraDto[] },
      { total: number; city: string }
    >(`/api/cctv${suffix}`);
    return {
      cameras: res.data.cameras,
      total: res.meta?.total ?? res.data.cameras.length,
      city: res.meta?.city ?? '',
    };
  },

  async getById(id: string): Promise<CctvCameraDto> {
    if (!IS_BACKEND_ENABLED) {
      await offlineMock.ensureCamerasLoaded();
      const mockUser = getMockSessionUser()!;
      const cam = offlineMock.getCameraById(mockUser, id);
      if (!cam) throw new Error('Kamera CCTV tidak ditemukan.');
      return cam;
    }

    const res = await apiFetch<{ camera: CctvCameraDto }>(`/api/cctv/${encodeURIComponent(id)}`);
    return res.data.camera;
  },

  async updateRoi(id: string, roiPolygon: NormalizedPolygon | null): Promise<CctvCameraDto> {
    if (!IS_BACKEND_ENABLED) {
      await offlineMock.ensureCamerasLoaded();
      const mockUser = getMockSessionUser()!;
      return offlineMock.updateCameraRoi(mockUser, id, roiPolygon);
    }

    const res = await apiFetch<{ camera: CctvCameraDto }>(
      `/api/cctv/${encodeURIComponent(id)}/roi`,
      {
        method: 'PATCH',
        body: { roiPolygon },
      },
    );
    return res.data.camera;
  },
};

export const zoneApi = {
  async list(): Promise<RestrictedZoneDto[]> {
    if (!IS_BACKEND_ENABLED) {
      return offlineMock.listZones(getMockSessionUser()!);
    }
    const res = await apiFetch<{ zones: RestrictedZoneDto[] }>('/api/zones');
    return res.data.zones;
  },

  async create(input: CreateZoneInput): Promise<RestrictedZoneDto> {
    if (!IS_BACKEND_ENABLED) {
      return offlineMock.createZone(getMockSessionUser()!, input);
    }
    const res = await apiFetch<{ zone: RestrictedZoneDto }>('/api/zones', {
      method: 'POST',
      body: input,
    });
    return res.data.zone;
  },

  async update(id: string, input: UpdateZoneInput): Promise<RestrictedZoneDto> {
    if (!IS_BACKEND_ENABLED) {
      return offlineMock.updateZone(getMockSessionUser()!, id, input);
    }
    const res = await apiFetch<{ zone: RestrictedZoneDto }>(
      `/api/zones/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: input,
      },
    );
    return res.data.zone;
  },

  async remove(id: string): Promise<void> {
    if (!IS_BACKEND_ENABLED) {
      offlineMock.removeZone(getMockSessionUser()!, id);
      return;
    }
    await apiFetch(`/api/zones/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};

export interface ReportListPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export const reportApi = {
  async autoDetect(
    payload: AutoDetectPayload,
    snapshotBlob: Blob,
  ): Promise<AutoDetectResponseData> {
    if (!IS_BACKEND_ENABLED) {
      return offlineMock.autoDetect(getMockSessionUser()!, payload, snapshotBlob);
    }

    const formData = new FormData();
    formData.append('snapshot', snapshotBlob, `capture-${payload.cameraId}.jpg`);
    formData.append('payload', JSON.stringify(payload));

    const res = await apiFetch<AutoDetectResponseData>('/api/reports/auto-detect', {
      method: 'POST',
      body: formData,
    });
    return res.data;
  },

  async list(params?: {
    statuses?: ReportStatus[];
    relocationRequested?: boolean;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ reports: ViolationReportDto[]; pagination: ReportListPagination }> {
    if (!IS_BACKEND_ENABLED) {
      const reports = offlineMock.listReports(getMockSessionUser()!, {
        statuses: params?.statuses,
        search: params?.search,
      });
      return {
        reports,
        pagination: {
          page: 1,
          pageSize: 50,
          totalItems: reports.length,
          totalPages: reports.length > 0 ? 1 : 0,
        },
      };
    }

    const qs = new URLSearchParams();
    if (params?.statuses && params.statuses.length > 0) {
      qs.set('status', params.statuses.join(','));
    }
    if (params?.relocationRequested !== undefined) {
      qs.set('relocationRequested', String(params.relocationRequested));
    }
    if (params?.search) qs.set('search', params.search);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';

    const res = await apiFetch<
      { reports: ViolationReportDto[] },
      { pagination: ReportListPagination }
    >(`/api/reports${suffix}`);
    return {
      reports: res.data.reports,
      pagination: res.meta?.pagination ?? {
        page: 1,
        pageSize: 20,
        totalItems: res.data.reports.length,
        totalPages: 1,
      },
    };
  },

  async getById(id: string): Promise<ViolationReportDetailDto> {
    if (!IS_BACKEND_ENABLED) {
      const found = offlineMock.getReportById(getMockSessionUser()!, id);
      if (!found) throw new Error('Laporan pelanggaran tidak ditemukan.');
      return found;
    }

    const res = await apiFetch<{ report: ViolationReportDetailDto }>(
      `/api/reports/${encodeURIComponent(id)}`,
    );
    return res.data.report;
  },

  async submitAction(
    id: string,
    payload: SubmitReportActionPayload,
    afterPhoto: File,
  ): Promise<ViolationReportDetailDto> {
    if (!IS_BACKEND_ENABLED) {
      return offlineMock.submitAction(getMockSessionUser()!, id, payload, afterPhoto);
    }

    const formData = new FormData();
    formData.append('afterPhoto', afterPhoto, afterPhoto.name);
    formData.append('payload', JSON.stringify(payload));

    const res = await apiFetch<{ report: ViolationReportDetailDto }>(
      `/api/reports/${encodeURIComponent(id)}/action`,
      {
        method: 'POST',
        body: formData,
      },
    );
    return res.data.report;
  },
};
