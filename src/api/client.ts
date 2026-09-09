import { API_BASE_URL } from '../config/api';
import { clearSession, getSession, updateTokens } from '../auth/session';

// Centralized API layer.
//
// Future screens should call the auth/user service functions instead of
// writing their own Authorization headers or fetch calls.

export class ApiError extends Error {
  status?: number;
  data?: unknown;

  constructor(message: string, status?: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
}

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

// Called when a refresh attempt fails and the session must be discarded.
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

function assertConfigured() {
  if (!API_BASE_URL) {
    throw new ApiError(
      'Backend URL is not configured. Set EXPO_PUBLIC_API_URL for this app.'
    );
  }
}

function sanitizeServerMessage(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim();
    // Never surface raw internal error strings.
    return trimmed.length > 200 ? fallback : trimmed;
  }
  return fallback;
}

function statusMessage(status: number): string {
  switch (status) {
    case 400:
      return 'The request was invalid. Please check your details.';
    case 401:
      return 'Invalid credentials or your session has expired.';
    case 403:
      return 'You are not authorized to perform this action.';
    case 404:
      return 'The requested resource was not found.';
    case 500:
      return 'Something went wrong on the server. Please try again.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiError(
      'The server returned an unexpected response.',
      response.status
    );
  }

  if (!response.ok) {
    const fallback = statusMessage(response.status);
    const message =
      body && typeof body === 'object' && 'message' in body
        ? sanitizeServerMessage((body as { message: unknown }).message, fallback)
        : fallback;
    throw new ApiError(message, response.status, body);
  }

  return body as T;
}

type RefreshResult =
  | { ok: true; accessToken: string }
  | { ok: false };

let refreshing: Promise<RefreshResult> | null = null;

async function refreshAccessToken(): Promise<RefreshResult> {
  const session = await getSession();
  if (!session?.refreshToken) {
    return { ok: false };
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
  } catch {
    // Network failure during refresh. Keep the stored session so the user is
    // not logged out just because the connection dropped.
    return { ok: false };
  }

  try {
    const json = await parseResponse<{
      success: boolean;
      data?: { accessToken?: string; refreshToken?: string };
    }>(res);

    if (!json.success || !json.data?.accessToken) {
      // The refresh token is invalid/expired: the session cannot be restored.
      await clearSession();
      return { ok: false };
    }

    const tokens = {
      accessToken: json.data.accessToken,
      // Refresh tokens are rotated: always store the newest one.
      refreshToken: json.data.refreshToken ?? session.refreshToken,
    };
    await updateTokens(tokens);
    return { ok: true, accessToken: tokens.accessToken };
  } catch {
    // Server returned a non-OK or malformed refresh response.
    if (res.status === 401 || res.status === 403) {
      await clearSession();
    }
    return { ok: false };
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  assertConfigured();

  const url = `${API_BASE_URL}${path}`;
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  let session = options.auth ? await getSession() : null;
  if (options.auth && session?.accessToken) {
    headers.Authorization = `Bearer ${session.accessToken}`;
  }

  const jsonBody = options.body !== undefined ? JSON.stringify(options.body) : undefined;

  let response: Response;
  try {
    response = await fetch(url, { method, headers, body: jsonBody });
  } catch {
    throw new ApiError(
      'Network unavailable. Please check your connection and try again.'
    );
  }

  if (options.auth && response.status === 401) {
    if (!refreshing) {
      refreshing = refreshAccessToken().finally(() => {
        refreshing = null;
      });
    }
    const result = await refreshing;

    if (result.ok && result.accessToken) {
      // Retry the failed request once with the fresh token.
      const retryHeaders = { ...headers, Authorization: `Bearer ${result.accessToken}` };
      let retryResponse: Response;
      try {
        retryResponse = await fetch(url, { method, headers: retryHeaders, body: jsonBody });
      } catch {
        throw new ApiError(
          'Network unavailable. Please check your connection and try again.'
        );
      }
      return parseResponse<T>(retryResponse);
    }

    // Refresh could not provide a new token. If the stored session was already
    // discarded (invalid/expired refresh token), return to Login; otherwise the
    // session is still intact and the failure was transient (e.g. offline).
    const stillStored = !!(await getSession());
    if (!stillStored) {
      unauthorizedHandler?.();
      throw new ApiError(
        'Your session has expired. Please sign in again.',
        401
      );
    }
    throw new ApiError(
      'Unable to reconnect. Please check your connection and try again.',
      401
    );
  }

  return parseResponse<T>(response);
}

export const api = {
  request,
  setUnauthorizedHandler,
};
