import { authFetch } from './client';

export async function login(username: string, password: string): Promise<{ ok: boolean; username?: string; error?: string }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await res.json() : null;
    if (res.ok) {
      return { ok: true, username: data?.username || username };
    }
    return { ok: false, error: data?.detail || data?.error || 'Invalid username or password' };
  } catch (e) {
    return { ok: false, error: 'Unable to reach the authentication service' };
  }
}

export type AuthStatus = 'authenticated' | 'no-auth-required' | 'unauthenticated' | 'unavailable';

export async function checkAuth(): Promise<AuthStatus> {
  try {
    const res = await fetch('/api/auth/status', { credentials: 'same-origin' });
    if (res.status === 401 || res.status === 403) return 'unauthenticated';
    if (!res.ok) return 'unavailable';
    const data: unknown = await res.json();
    if (!data || typeof data !== 'object' || typeof (data as Record<string, unknown>).auth_required !== 'boolean') {
      return 'unavailable';
    }
    if (!(data as Record<string, unknown>).auth_required) return 'no-auth-required';
    const check = await authFetch('/api/relays');
    if (check.ok) return 'authenticated';
    return check.status === 401 || check.status === 403 ? 'unauthenticated' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    });
  } catch {
    // Best-effort logout; client state will still be cleared.
  }
}
