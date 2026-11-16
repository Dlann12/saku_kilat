export interface ApiError extends Error {
  code?: string;
  status?: number;
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
  const headers = new Headers();
  headers.set('Accept', 'application/json');
  const csrf = getCsrfToken();
  if (csrf) headers.set('X-CSRF-TOKEN', csrf);
  const xsrf = getXsrfCookie();
  if (xsrf) headers.set('X-XSRF-TOKEN', xsrf);

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (options.idempotencyKey) {
    headers.set('X-Idempotency-Key', options.idempotencyKey);
  }

  const res = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'same-origin',
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const json = (await res.json().catch(() => ({}))) as {
    data?: T;
    error?: { code?: string; message?: string };
  };

  if (!res.ok) {
    const err = new Error(json.error?.message || `Permintaan gagal (${res.status})`) as ApiError;
    err.code = json.error?.code || 'API_ERROR';
    err.status = res.status;
    throw err;
  }

  const data = json.data as T & { csrf_token?: string };
  if (data && typeof data === 'object' && 'csrf_token' in data && data.csrf_token) {
    updateCsrfToken(data.csrf_token);
  }

  return json.data as T;
}

