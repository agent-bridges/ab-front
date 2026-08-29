import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkAuth } from './auth';

afterEach(() => vi.unstubAllGlobals());

describe('checkAuth', () => {
  it('reports an unavailable auth service without treating it as logout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network unavailable')));
    await expect(checkAuth()).resolves.toBe('unavailable');
  });

  it('reports non-auth server failures as unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await expect(checkAuth()).resolves.toBe('unavailable');
  });

  it('accepts only an authoritative authentication rejection', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ auth_required: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response('', { status: 401 })));
    await expect(checkAuth()).resolves.toBe('unauthenticated');
  });

  it('rejects malformed auth status as unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })));
    await expect(checkAuth()).resolves.toBe('unavailable');
  });
});
