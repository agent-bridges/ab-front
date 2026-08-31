import { authFetch } from './client';
import type { Agent, DaemonLink, DaemonLinksResponse, Relay } from '../types';

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Daemon links response is missing ${field}`);
  return value;
}

function parseLink(value: unknown): DaemonLink {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Daemon returned an invalid link');
  const row = value as Record<string, unknown>;
  const state = row.state;
  if (state !== 'pending' && state !== 'active' && state !== 'offline' && state !== 'broken') throw new Error('Daemon returned an invalid link state');
  return {
    name: requiredString(row.name, 'link name'),
    peer_fingerprint: requiredString(row.peer_fingerprint, 'peer fingerprint'),
    relay_name: requiredString(row.relay_name, 'relay name'),
    relay_address: requiredString(row.relay_address, 'relay address'),
    state,
    last_success: typeof row.last_success === 'string' ? row.last_success : null,
    last_error: typeof row.last_error === 'string' ? row.last_error : null,
    created_at: requiredString(row.created_at, 'created_at'),
    updated_at: requiredString(row.updated_at, 'updated_at'),
  };
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as Record<string, unknown>;
    if (typeof payload.error === 'string' && payload.error) return payload.error;
  } catch { /* use the stable fallback */ }
  return `${fallback} (${response.status})`;
}

export async function fetchDaemonLinks(agentId: string): Promise<DaemonLinksResponse> {
  const response = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/links`, { cache: 'no-store' });
  if (!response.ok) throw new Error(await errorMessage(response, 'Could not read daemon links'));
  const payload = await response.json() as Record<string, unknown>;
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.links)) throw new Error('Daemon returned an invalid links response');
  return { self_fingerprint: requiredString(payload.self_fingerprint, 'self fingerprint'), links: payload.links.map(parseLink) };
}

export async function createDaemonLink(agentId: string, peer: Agent, relay: Relay): Promise<void> {
  const response = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: peer.name,
      peer_fingerprint: peer.fingerprint,
      relay_name: relay.name,
      relay_address: relay.address,
    }),
  });
  if (!response.ok) throw new Error(await errorMessage(response, `Could not link ${peer.name}`));
}

export async function deleteDaemonLink(agentId: string, peerFingerprint: string): Promise<void> {
  const response = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/links/${encodeURIComponent(peerFingerprint)}`, { method: 'DELETE' });
  if (!response.ok) throw new Error(await errorMessage(response, 'Could not remove daemon link'));
}

/** Create both halves explicitly. There is no implicit fallback or relay selection. */
export async function linkDaemonPair(source: Agent, peer: Agent, relay: Relay): Promise<void> {
  await createDaemonLink(source.id, peer, relay);
  try {
    await createDaemonLink(peer.id, source, relay);
  } catch (reason) {
    try { await deleteDaemonLink(source.id, peer.fingerprint); } catch { /* report the original failure */ }
    throw reason;
  }
}

export async function unlinkDaemonPair(source: Agent, peer: Agent | undefined, peerFingerprint: string): Promise<void> {
  await deleteDaemonLink(source.id, peerFingerprint);
  if (!peer) return;
  try {
    await deleteDaemonLink(peer.id, source.fingerprint);
  } catch (reason) {
    throw new Error(`Local link removed, but ${peer.name} could not be updated: ${reason instanceof Error ? reason.message : String(reason)}`);
  }
}
