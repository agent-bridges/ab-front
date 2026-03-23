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

/** Returns 'authenticated' | 'no-auth-required' | 'unauthenticated' */
export async function checkAuth(): Promise<'authenticated' | 'no-auth-required' | 'unauthenticated'> {
  try {
    const res = await fetch('/api/auth/status', { credentials: 'same-origin' });
    if (!res.ok) return 'unauthenticated';
    const data = await res.json();
    if (!data.auth_required) return 'no-auth-required';
    const check = await authFetch('/api/agents');
    return check.ok ? 'authenticated' : 'unauthenticated';
  } catch {
    return 'unauthenticated';
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
