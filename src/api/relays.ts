import { authFetch } from './client';
import type { Relay, RelayMachine, RelayStatus } from '../types';

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Relay discovery is missing ${field}`);
  return value;
}

function parseMachine(value: unknown, relayId: string): RelayMachine {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Relay ${relayId} returned an invalid machine`);
  }
  const row = value as Record<string, unknown>;
  const fingerprint = requiredString(row.fingerprint, 'machine fingerprint');
  const id = requiredString(row.id, 'machine route id');
  if (!id.startsWith(`${relayId}~`)) throw new Error(`Machine route ${id} does not belong to relay ${relayId}`);
  return {
    id,
    name: requiredString(row.name, 'machine name'),
    fingerprint,
    online: row.online === true,
    last_seen: typeof row.last_seen === 'string' ? row.last_seen : null,
  };
}

function parseRelayStatus(value: unknown, relayId: string): RelayStatus {
  if (value === 'online' || value === 'offline' || value === 'disabled') return value;
  throw new Error(`Relay ${relayId} returned an invalid status`);
}

export function parseRelays(payload: unknown): Relay[] {
  if (!Array.isArray(payload)) throw new Error('Relay discovery returned an invalid response');
  return payload.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Relay discovery returned an invalid relay');
    }
    const row = value as Record<string, unknown>;
    const id = requiredString(row.id, 'relay id');
    if (!Array.isArray(row.machines)) throw new Error(`Relay ${id} is missing machines`);
    return {
      id,
      name: requiredString(row.name, 'relay name'),
      address: typeof row.address === 'string' ? row.address : undefined,
      enabled: row.enabled === true,
      status: parseRelayStatus(row.status, id),
      machines: row.machines.map((machine) => parseMachine(machine, id)),
    };
  });
}

export async function fetchRelays(): Promise<Relay[]> {
  const response = await authFetch('/api/relays', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Relay discovery failed (${response.status})`);
  return parseRelays(await response.json());
}
