import { api } from './client';
import type { Session, User } from '../auth/types';

interface LoginPayload {
  gymId: string;
  email: string;
  password: string;
  role: 'admin' | 'superadmin';
}

interface LoginResponse {
  success: boolean;
  message?: string;
  data?: {
    user?: User;
    accessToken?: string;
    refreshToken?: string;
  };
}

export async function login(payload: LoginPayload): Promise<Session> {
  const res = await api.request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: payload,
  });

  const data = res.data;
  if (!data?.user || !data.accessToken || !data.refreshToken) {
    if (data?.user && data.accessToken && !data.refreshToken) {
      throw new Error('Sign-in is incomplete: the server did not return a refresh token.');
    }
    throw new Error('The server returned an unexpected response.');
  }
  if (data.user.role !== 'admin' && data.user.role !== 'superadmin') {
    throw new Error('This account is not permitted to sign in.');
  }

  return {
    user: data.user,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  };
}

export async function logout(refreshToken?: string): Promise<void> {
  if (refreshToken) {
    // Fire and forget: even if the network call fails we still clear locally.
    await api.request('/auth/logout', { method: 'POST', body: { refreshToken } }).catch(() => undefined);
  }
}
