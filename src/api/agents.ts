import { authFetch } from './client';
import { readJsonOrThrow } from './http';
import type { Agent } from '../types';

export async function fetchAgents(): Promise<Agent[]> {
  const res = await authFetch('/api/agents');
  return readJsonOrThrow<Agent[]>(res, 'Failed to fetch agents');
}

export interface AgentDetail extends Agent {
  jwt_key: string;
  pty_info?: Record<string, unknown> | null;
}

export interface AgentMutation {
  name: string;
  ip: string;
  jwt_key: string;
}

export interface AgentMutationResult {
  ok: boolean;
  id: string;
  name: string;
  ip: string;
}

export interface PtyDaemonCheckResult {
  ok: boolean;
  message: string;
}

export async function fetchAgent(agentId: string): Promise<AgentDetail> {
  const res = await authFetch(`/api/agents/${agentId}`);
  return readJsonOrThrow<AgentDetail>(res, 'Failed to fetch agent');
}

export async function createAgent(data: AgentMutation): Promise<AgentMutationResult> {
  const res = await authFetch('/api/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return readJsonOrThrow<AgentMutationResult>(res, 'Failed to create agent');
}

export async function updateAgent(agentId: string, data: AgentMutation): Promise<{ ok: boolean; id: string }> {
  const res = await authFetch(`/api/agents/${agentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return readJsonOrThrow<{ ok: boolean; id: string }>(res, 'Failed to update agent');
}

export async function deleteAgent(agentId: string): Promise<{ ok: boolean }> {
  const res = await authFetch(`/api/agents/${agentId}`, {
    method: 'DELETE',
  });
  return readJsonOrThrow<{ ok: boolean }>(res, 'Failed to delete agent');
}

function splitDaemonAddress(address: string): { ip: string; port: number } {
  const value = address.trim();
  const bracketed = value.match(/^\[(.+)\]:(\d+)$/);
  if (bracketed) {
    return { ip: bracketed[1], port: Number(bracketed[2]) || 8421 };
  }

  const lastColon = value.lastIndexOf(':');
  if (lastColon > -1 && value.indexOf(':') === lastColon) {
    const maybePort = Number(value.slice(lastColon + 1));
    if (!Number.isNaN(maybePort)) {
      return { ip: value.slice(0, lastColon), port: maybePort || 8421 };
    }
  }

  return { ip: value, port: 8421 };
}

export async function checkPtyDaemon(address: string, jwtKey: string): Promise<PtyDaemonCheckResult> {
  const { ip, port } = splitDaemonAddress(address);
  const params = new URLSearchParams({ ip, port: String(port), jwt: jwtKey });
  const res = await authFetch(`/api/pty-daemon/check?${params.toString()}`);
  return readJsonOrThrow<PtyDaemonCheckResult>(res, 'Failed to check PTY daemon');
}
