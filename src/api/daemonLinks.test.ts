import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDaemonLink, fetchDaemonLinks } from './daemonLinks';
import type { Agent, Relay } from '../types';

const agent: Agent = { id: 'r~aa', name: 'a', relay_id: 'r', relay_name: 'Remote', fingerprint: 'aa', online: true };
const peer: Agent = { id: 'r~bb', name: 'b', relay_id: 'r', relay_name: 'Remote', fingerprint: 'bb', online: true };
const relay: Relay = { id: 'r', name: 'Remote', address: 'relay:9500', server_fingerprint: 'cc', enabled: true, status: 'online', machines: [] };

afterEach(() => vi.unstubAllGlobals());

describe('daemon links API', () => {
  it('parses the explicit peer and route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      self_fingerprint: 'aa',
      links: [{ name: 'b', peer_fingerprint: 'bb', relay_name: 'Remote', relay_address: 'relay:9500', state: 'active', created_at: 'now', updated_at: 'now' }],
    }), { status: 200 })));

    const result = await fetchDaemonLinks(agent.id);

    expect(result.links[0]).toMatchObject({ name: 'b', peer_fingerprint: 'bb', state: 'active' });
  });

  it('posts the immutable peer fingerprint and chosen relay address', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await createDaemonLink(agent.id, peer, relay);

    expect(fetchMock).toHaveBeenCalledWith('/api/agents/r~aa/links', expect.objectContaining({ method: 'POST' }));
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(options.body))).toEqual({ name: 'b', peer_fingerprint: 'bb', relay_name: 'Remote', relay_address: 'relay:9500' });
  });
});
