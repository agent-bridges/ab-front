import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createRelay,
  deleteRelay,
  RelayRevisionConflict,
  updateRelay,
  type RelayCreateInput,
} from './relayAdmin';

afterEach(() => vi.unstubAllGlobals());

const relay: RelayCreateInput = {
  id: 'home',
  name: 'Home',
  address: '192.168.1.7:9500',
  server_fingerprint: 'ab'.repeat(32),
  enabled: true,
};

describe('relay admin API', () => {
  it('sends exact create/update/delete bodies with the current revision', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ revision: 8, relay }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ revision: 9, relay }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ revision: 10, id: 'home' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await createRelay(7, relay);
    await updateRelay(8, 'home', { name: relay.name, address: relay.address, server_fingerprint: relay.server_fingerprint, enabled: false });
    await deleteRelay(9, 'home');

    expect(fetchMock.mock.calls[0]).toEqual(['/api/relays', expect.objectContaining({
      method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': '"7"' }, body: JSON.stringify(relay), credentials: 'same-origin',
    })]);
    expect(fetchMock.mock.calls[1]).toEqual(['/api/relays/home', expect.objectContaining({
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': '"8"' },
      body: JSON.stringify({ name: relay.name, address: relay.address, server_fingerprint: relay.server_fingerprint, enabled: false }),
      credentials: 'same-origin',
    })]);
    expect(fetchMock.mock.calls[2]).toEqual(['/api/relays/home', expect.objectContaining({
      method: 'DELETE', headers: { 'If-Match': '"9"' }, credentials: 'same-origin',
    })]);
  });

  it('surfaces 412 as a typed conflict carrying the current revision', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'stale_revision', current_revision: 12,
    }), { status: 412, headers: { 'Content-Type': 'application/json', ETag: '"12"' } })));

    await expect(deleteRelay(7, 'home')).rejects.toEqual(expect.objectContaining<Partial<RelayRevisionConflict>>({
      name: 'RelayRevisionConflict', currentRevision: 12,
    }));
  });
});
