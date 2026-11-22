import type { ApiErrorDetail, ApiErrorResponse, ApiSuccessResponse } from '@/types';

const TOKEN_STORAGE_KEY = 'patra_auth_token';
const OFFLINE_MODE_KEY = 'patra_offline_preview_user';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: ApiErrorDetail[];
  isNetworkError: boolean;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: ApiErrorDetail[],
    isNetworkError = false,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.isNetworkError = isNetworkError;
  }
}

export function getStoredToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota / private mode issues
  }
}

export function getOfflinePreviewDemoKey(): string | null {
  try {
    return window.sessionStorage.getItem(OFFLINE_MODE_KEY);
  } catch {
    return null;
  }
}

export function setOfflinePreviewDemoKey(demoKey: string | null): void {
  try {
    if (demoKey) {
      window.sessionStorage.setItem(OFFLINE_MODE_KEY, demoKey);
    } else {
      window.sessionStorage.removeItem(OFFLINE_MODE_KEY);
    }
  } catch {
    // Ignore storage issues
  }
}

export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL as string | undefined;
  // Di local dev, gunakan relative path agar Vite proxy (/api -> localhost:3001) menghindari CORS.
  if (import.meta.env.DEV) {
    return '';
  }
  return configured ? configured.replace(/\/+$/, '') : '';
}

let unauthorizedListener: (() => void) | null = null;

export function onUnauthorized(listener: (() => void) | null): void {
  unauthorizedListener = listener;
}

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipAuth?: boolean;
}

export async function apiFetch<T, M = Record<string, unknown>>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<ApiSuccessResponse<T, M>> {
  const { body, headers: customHeaders, skipAuth = false, ...rest } = options;
  const headers = new Headers(customHeaders);

  if (!skipAuth) {
    const token = getStoredToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  let requestBody: BodyInit | undefined;
  if (body instanceof FormData) {
    requestBody = body;
  } else if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
    requestBody = JSON.stringify(body);
  }

  const url = `${getApiBaseUrl()}${path}`;
  let response: Response;

  try {
    response = await fetch(url, {
      ...rest,
      headers,
      body: requestBody,
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Tidak dapat terhubung ke server PATRA. Periksa koneksi jaringan atau pastikan BE-Patra berjalan.',
      undefined,
      true,
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  let parsed: unknown = null;

  if (contentType.includes('application/json')) {
    try {
      parsed = await response.json();
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const errPayload = parsed as ApiErrorResponse | null;
    const code = errPayload?.error?.code ?? `HTTP_${response.status}`;
    const message =
      errPayload?.error?.message ??
      (response.status === 413
        ? 'Ukuran berkas melebihi batas maksimal 4 MB.'
        : 'Terjadi kesalahan saat memproses permintaan.');

    if (response.status === 401 && !skipAuth && unauthorizedListener) {
      unauthorizedListener();
    }

    throw new ApiError(response.status, code, message, errPayload?.error?.details);
  }

  if (!parsed || typeof parsed !== 'object' || !('ok' in parsed)) {
    throw new ApiError(
      response.status,
      'INVALID_RESPONSE',
      'Format respons server tidak sesuai kontrak API.',
    );
  }

  return parsed as ApiSuccessResponse<T, M>;
}
