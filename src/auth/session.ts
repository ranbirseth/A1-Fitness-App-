import * as SecureStore from 'expo-secure-store';
import type { Session, Tokens, User } from './types';

// Secure key-value storage.
//
// The refresh token is sensitive, so it lives in expo-secure-store (Android
// Keystore / iOS Keychain) along with the access token and the authenticated
// user. We never store the user's password.

const SESSION_KEY = 'a1fitness.auth.session';

let cachedSession: Session | null = null;

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.accessToken === 'string' &&
    typeof v.refreshToken === 'string' &&
    !!(v.user && typeof v.user === 'object')
  );
}

function isUser(value: unknown): value is User {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.role === 'string';
}

export async function saveSession(session: Session): Promise<void> {
  cachedSession = session;
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function updateTokens(tokens: Tokens): Promise<void> {
  if (!cachedSession) {
    // Nothing to update; callers should only rotate tokens after login.
    return;
  }
  cachedSession = { ...cachedSession, ...tokens };
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(cachedSession));
}

export async function getSession(): Promise<Session | null> {
  if (cachedSession) return cachedSession;
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isSession(parsed) || !isUser(parsed.user)) {
      await clearSession();
      return null;
    }
    cachedSession = parsed as Session;
    return cachedSession;
  } catch {
    await clearSession().catch(() => undefined);
    return null;
  }
}

export async function clearSession(): Promise<void> {
  cachedSession = null;
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch {
    // Best effort; a failed delete should not block logout.
  }
}
