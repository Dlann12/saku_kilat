export interface ApiError extends Error {
  code?: string;
  status?: number;
}

const TOKEN_KEY = 'saku_auth_token';
const BASE_URL_KEY = 'saku_api_base_url';

export function isCapacitorRuntime(): boolean {
  if (import.meta.env.VITE_CAPACITOR_BUILD === '1') return true;
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

export function getApiBaseUrl(): string {
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(BASE_URL_KEY) : '';
  const raw = (stored || import.meta.env.VITE_API_BASE_URL || '').trim();
  return raw.replace(/\/+$/, '');
}

export function setApiBaseUrl(url: string): string {
  const normalized = url.trim().replace(/\/+$/, '');
  if (typeof localStorage !== 'undefined') {
    if (normalized) {
      localStorage.setItem(BASE_URL_KEY, normalized);
    } else {
      localStorage.removeItem(BASE_URL_KEY);
    }
  }
  return normalized;
}

export function getAuthToken(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setAuthToken(token?: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function clearAuthToken(): void {
  setAuthToken(null);
}

export function resolveApiUrl(url: string): string {
  if (!url.startsWith('/')) return url;
  const base = getApiBaseUrl();
  return base ? `${base}${url}` : url;
}

export function updateCsrfToken(token?: string): void {
  if (!token) return;
  const meta = document.querySelector('meta[name="csrf-token"]');
  if (meta) {
    meta.setAttribute('content', token);
  }
}

function getCsrfToken(): string {
  return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
}

function getXsrfCookie(): string {
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export function makeIdempotencyKey(prefix = 'sk'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  idempotencyKey?: string;
}

export async function apiFetch<T>(url: string, options: ApiRequestOptions = {}): Promise<T> {
  const targetUrl = resolveApiUrl(url);
  const crossOrigin = Boolean(getApiBaseUrl());
  const nativeClient = isCapacitorRuntime();

  const headers = new Headers();
  headers.set('Accept', 'application/json');

  const token = getAuthToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (nativeClient || crossOrigin) {
    headers.set('X-Saku-Mobile', '1');
  } else {
    const csrf = getCsrfToken();
    if (csrf) headers.set('X-CSRF-TOKEN', csrf);
    const xsrf = getXsrfCookie();
    if (xsrf) headers.set('X-XSRF-TOKEN', xsrf);
  }

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (options.idempotencyKey) {
    headers.set('X-Idempotency-Key', options.idempotencyKey);
  }

  let res: Response;
  try {
    res = await fetch(targetUrl, {
      method: options.method ?? 'GET',
      headers,
      credentials: crossOrigin ? 'omit' : 'same-origin',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    const err = new Error(
      crossOrigin || nativeClient
        ? `Tidak dapat terhubung ke server API (${getApiBaseUrl() || 'URL belum diatur'}). Periksa IP LAN & port server Laravel.`
        : 'Gagal terhubung ke server Laravel.'
    ) as ApiError;
    err.code = 'NETWORK_ERROR';
    err.status = 0;
    throw err;
  }

  const json = (await res.json().catch(() => ({}))) as {
    data?: T;
    error?: { code?: string; message?: string };
  };

  if (!res.ok) {
    if (res.status === 401 && url !== '/api/v1/auth/login') {
      clearAuthToken();
    }
    const err = new Error(json.error?.message || `Permintaan gagal (${res.status})`) as ApiError;
    err.code = json.error?.code || 'API_ERROR';
    err.status = res.status;
    throw err;
  }

  const data = json.data as (T & { csrf_token?: string; token?: string }) | undefined;
  if (data && typeof data === 'object') {
    if ('csrf_token' in data && data.csrf_token) {
      updateCsrfToken(data.csrf_token);
    }
    if ('token' in data && typeof data.token === 'string' && data.token) {
      setAuthToken(data.token);
    }
  }

  return json.data as T;
}
