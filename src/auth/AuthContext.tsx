import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as authApi from '../api/auth';
import { api } from '../api/client';
import { clearSession, getSession, saveSession } from './session';
import type { User } from './types';

type AuthStatus = 'restoring' | 'authenticated' | 'unauthenticated';

interface LoginPayload {
  gymId: string;
  email: string;
  password: string;
  role: 'admin' | 'superadmin';
}

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  busy: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('restoring');
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);

  const clearAuth = useCallback(() => {
    setBusy(false);
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  useEffect(() => {
    // Restore a stored session (tokens + user). Access-token refresh happens
    // transparently through the API client on the first 401.
    (async () => {
      const session = await getSession();
      if (session) {
        setUser(session.user);
        setStatus('authenticated');
      } else {
        setStatus('unauthenticated');
      }
    })();
  }, []);

  // Centralized hook: when the client discards a session (refresh failed),
  // drop the authenticated state so the app returns to Login.
  useEffect(() => {
    api.setUnauthorizedHandler(clearAuth);
    return () => api.setUnauthorizedHandler(null);
  }, [clearAuth]);

  const login = useCallback(async (payload: LoginPayload) => {
    setBusy(true);
    try {
      const session = await authApi.login(payload);
      await saveSession(session);
      setUser(session.user);
      setStatus('authenticated');
    } finally {
      setBusy(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setBusy(true);
    try {
      const session = await getSession();
      await authApi.logout(session?.refreshToken);
      await clearSession();
      setUser(null);
      setStatus('unauthenticated');
    } finally {
      setBusy(false);
    }
  }, []);

  const value = useMemo(
    () => ({ status, user, busy, login, logout }),
    [status, user, busy, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
