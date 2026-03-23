import { authFetch } from './client';
import { readJson, readJsonOrThrow } from './http';

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

export async function updatePtyMeta(agentId: string, sessionId: string, data: { label?: string; meta?: Record<string, unknown> }) {
  const res = await authFetch(`/api/agents/${agentId}/pty/${sessionId}/meta`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return readJsonOrThrow(res, 'Failed to update PTY metadata');
}
