import { authFetch } from './client';
import { readJsonOrThrow, throwFromResponse } from './http';

export interface TunnelEntry {
  pid: string;
  src_port: string;
  dst_port: string;
  url: string;
  status: string;
}

export interface TunnelsList {
  installed: boolean;
  tunnels: TunnelEntry[];
  message?: string;
}

function base(agentId: string | null | undefined) {
  if (!agentId) throw new Error('agent id required');
  return `/api/agents/${encodeURIComponent(agentId)}/tunnels`;
}

export async function listTunnels(agentId: string | null | undefined): Promise<TunnelsList> {
  const resp = await authFetch(base(agentId));
  return readJsonOrThrow<TunnelsList>(resp, 'Failed to list tunnels');
}

export async function createTunnel(
  agentId: string | null | undefined,
  src_port: string | number,
  dst_port: string | number,
): Promise<TunnelsList> {
  const resp = await authFetch(base(agentId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ src_port: String(src_port), dst_port: String(dst_port) }),
  });
  return readJsonOrThrow<TunnelsList>(resp, 'Failed to create tunnel');
}

export async function killTunnel(
  agentId: string | null | undefined,
  pid: string,
): Promise<TunnelsList> {
  const resp = await authFetch(`${base(agentId)}/${encodeURIComponent(pid)}`, { method: 'DELETE' });
  if (!resp.ok) await throwFromResponse(resp, 'Failed to kill tunnel');
  return resp.json();
}
