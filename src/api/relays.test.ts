import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRelays, parseRelays } from './relays';

afterEach(() => vi.unstubAllGlobals());

describe('relay discovery', () => {
  it('parses Relay -> daemon hierarchy including disabled and empty relays', () => {
    const fingerprint = 'ab'.repeat(32);
    const discovery = parseRelays({ revision: 7, relays: [
      { id: 'home', name: 'Home', address: 'home:9500', server_fingerprint: '00'.repeat(32), enabled: true, status: 'online', machines: [{ id: `home~${fingerprint}`, name: 'ab2', fingerprint, online: true }] },
      { id: 'remote', name: 'Remote', address: 'remote:9500', server_fingerprint: '11'.repeat(32), enabled: false, status: 'disabled', machines: [] },
    ] });

    expect(discovery.revision).toBe(7);
    expect(discovery.relays[0].machines[0].id).toBe(`home~${fingerprint}`);
    expect(discovery.relays[1]).toMatchObject({ name: 'Remote', enabled: false, status: 'disabled', machines: [] });
  });

  it('rejects a route nested under the wrong relay', () => {
    expect(() => parseRelays({ revision: 1, relays: [{
      id: 'home', name: 'Home', address: 'home:9500', server_fingerprint: '00'.repeat(32), enabled: true, status: 'online',
      machines: [{ id: `remote~${'ab'.repeat(32)}`, name: 'ab2', fingerprint: 'ab'.repeat(32), online: true }],
    }] })).toThrow('does not belong to relay home');
  });

  it('rejects unknown relay status values', () => {
    expect(() => parseRelays({ revision: 1, relays: [{
      id: 'home', name: 'Home', address: 'home:9500', server_fingerprint: '00'.repeat(32), enabled: true, status: 'degraded', machines: [],
    }] })).toThrow('Relay home returned an invalid status');
  });

  it('reports discovery failure instead of falling back to agents', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await expect(fetchRelays()).rejects.toThrow('Relay discovery failed (503)');
  });
});
