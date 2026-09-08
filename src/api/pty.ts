import { authFetch } from './client';
import { readJson, readJsonOrThrow } from './http';
import type { PtySession } from '../types';

interface CreatePtyOptions {
  agentId: string;
  projectPath?: string;
  rows?: number;
  cols?: number;
  shellOnly?: boolean;
}

interface CreatePtyResult {
  ok: boolean;
  session_id?: string;
  name?: string;
  project_path?: string;
  error?: string;
}

export async function createPty(options: CreatePtyOptions): Promise<CreatePtyResult> {
  const { agentId, projectPath = '/', rows = 40, cols = 120, shellOnly = true } = options;
  try {
    const resp = await authFetch(`/api/agents/${agentId}/pty`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_path: projectPath,
        rows,
        cols,
        shell_only: shellOnly,
      }),
    });
    const data = await readJson<CreatePtyResult>(resp, { ok: false, error: `Failed to create PTY: ${resp.status}` });
    if (typeof data.ok !== 'boolean') data.ok = resp.ok;
    return data;
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function killPty(agentId: string, sessionId: string) {
  const res = await authFetch(`/api/agents/${agentId}/pty/${sessionId}`, { method: 'DELETE' });
  return readJsonOrThrow(res, 'Failed to close PTY');
}

export async function renamePty(agentId: string, sessionId: string, name: string) {
  const res = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/pty/${encodeURIComponent(sessionId)}/name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return readJsonOrThrow(res, 'Failed to rename PTY session');
}

export async function setPtyLabel(agentId: string, sessionId: string, label: string) {
  const res = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/pty/${encodeURIComponent(sessionId)}/label`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label }),
  });
  return readJsonOrThrow(res, 'Failed to change PTY label');
}

/** REST is intentionally used here: session metadata is not part of pty-state websocket rows. */
export async function listPtySessions(agentId: string): Promise<PtySession[]> {
  const res = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/pty`);
  return readJsonOrThrow<PtySession[]>(res, 'Failed to load PTY metadata');
}

export async function setPtyFavourite(agentId: string, sessionId: string, fav: boolean) {
  const res = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/pty/${encodeURIComponent(sessionId)}/meta`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ meta: { fav } }),
  });
  return readJsonOrThrow<{ ok: boolean; meta: Record<string, unknown> }>(res, 'Failed to update favourite');
}

export async function sendPtyText(agentId: string, sessionId: string, text: string, enter = true) {
  const res = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/pty/${encodeURIComponent(sessionId)}/stdin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, enter }),
  });
  return readJsonOrThrow<{ ok: boolean; bytes: number; bracketed_paste: boolean }>(res, 'Failed to send terminal input');
}

export async function renameDaemon(agentId: string, name: string) {
  const res = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return readJsonOrThrow(res, 'Failed to rename daemon');
}
