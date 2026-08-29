import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRelays } from '../api/relays';
import { useAgentStore } from './agentStore';

vi.mock('../api/relays', () => ({ fetchRelays: vi.fn() }));

beforeEach(() => {
  useAgentStore.getState().reset();
  vi.mocked(fetchRelays).mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('relay discovery store', () => {
  it('fails closed and exposes an actionable discovery error', async () => {
    vi.mocked(fetchRelays).mockRejectedValue(new Error('Relay discovery failed (503)'));

    await useAgentStore.getState().loadRelays();

    expect(useAgentStore.getState()).toMatchObject({
      relays: [],
      agents: [],
      currentAgentId: null,
      loading: false,
      discoveryError: 'Relay discovery failed (503)',
    });
  });

  it('selects only an online machine on an online enabled relay', async () => {
    const fingerprint = 'ab'.repeat(32);
    vi.mocked(fetchRelays).mockResolvedValue([
      { id: 'remote', name: 'Remote', enabled: false, status: 'disabled', machines: [{ id: `remote~${fingerprint}`, name: 'ab2', fingerprint, online: true }] },
      { id: 'home', name: 'Home', enabled: true, status: 'online', machines: [{ id: `home~${fingerprint}`, name: 'ab2', fingerprint, online: true }] },
    ]);

    await useAgentStore.getState().loadRelays(`remote~${fingerprint}`);

    expect(useAgentStore.getState().currentAgentId).toBe(`home~${fingerprint}`);
    expect(useAgentStore.getState().relays).toHaveLength(2);
    expect(useAgentStore.getState().agents).toHaveLength(2);
  });
});
