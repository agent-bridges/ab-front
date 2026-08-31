import type { Agent, Relay } from '../types';

export function agentDisplayLabel(agent: Agent, daemonName = agent.name): string {
  return `${agent.relay_name} → ${daemonName}`;
}

export function flattenRelayMachines(relays: Relay[]): Agent[] {
  return relays.flatMap((relay) => relay.machines.map((machine) => ({
    ...machine,
    relay_id: relay.id,
    relay_name: relay.name,
    ip: relay.address,
    is_local: false,
    created_at: machine.last_seen || '',
    pty_info: machine.online ? { online: true, relay_id: relay.id } : null,
  })));
}

export function relayStateLabel(relay: Relay): string {
  if (!relay.enabled) return 'disabled';
  return relay.status;
}

export function relayCanConnect(relay: Relay): boolean {
  return relay.enabled && relay.status === 'online';
}
