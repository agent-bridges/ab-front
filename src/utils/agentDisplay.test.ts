import { describe, expect, it } from 'vitest';
import type { Relay } from '../types';
import { agentDisplayLabel, flattenRelayMachines, relayCanConnect, relayStateLabel } from './agentDisplay';

describe('agent relay presentation', () => {
  it('keeps the same daemon distinct through Home and Remote', () => {
    const fingerprint = 'ab'.repeat(32);
    const relays: Relay[] = [
      { id: 'home', name: 'Home', enabled: true, status: 'online', machines: [{ id: `home~${fingerprint}`, name: 'ab2', fingerprint, online: true }] },
      { id: 'remote', name: 'Remote', enabled: true, status: 'online', machines: [{ id: `remote~${fingerprint}`, name: 'ab2', fingerprint, online: true }] },
    ];
    const [home, remote] = flattenRelayMachines(relays);

    expect(agentDisplayLabel(home)).toBe('Home → ab2');
    expect(agentDisplayLabel(remote)).toBe('Remote → ab2');
    expect(home.id).not.toBe(remote.id);
    expect(home.fingerprint).toBe(remote.fingerprint);
  });

  it('preserves disabled and empty relay nodes in the hierarchy', () => {
    const relays: Relay[] = [
      { id: 'home', name: 'Home', enabled: false, status: 'offline', machines: [] },
      { id: 'remote', name: 'Remote', enabled: true, status: 'offline', machines: [] },
    ];

    expect(relays.map((relay) => [relay.name, relayStateLabel(relay), relay.machines.length])).toEqual([
      ['Home', 'disabled', 0],
      ['Remote', 'offline', 0],
    ]);
    expect(relays.map(relayCanConnect)).toEqual([false, false]);
    expect(flattenRelayMachines(relays)).toEqual([]);
  });
});
