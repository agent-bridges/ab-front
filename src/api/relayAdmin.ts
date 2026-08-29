import { authFetch } from './client';

export interface RelayCreateInput {
  id: string;
  name: string;
  address: string;
  server_fingerprint: string;
  enabled: boolean;
}

export type RelayUpdateInput = Omit<RelayCreateInput, 'id'>;

export interface RelayMutationResult {
  revision: number;
  relay?: RelayCreateInput;
  id?: string;
}

export class RelayRevisionConflict extends Error {
  constructor(public readonly currentRevision: number | null) {
    super('Relay configuration changed on the server. The relay tree was reloaded; review and try again.');
    this.name = 'RelayRevisionConflict';
  }
}

async function mutationOrThrow(response: Response, fallback: string): Promise<RelayMutationResult> {
  const data = await response.json().catch(() => null) as { detail?: string; error?: string; current_revision?: number; revision?: number; relay?: RelayCreateInput; id?: string } | null;
  if (response.ok) {
    if (!data || !Number.isSafeInteger(data.revision)) throw new Error(`${fallback}: invalid response`);
    return data as RelayMutationResult;
  }
  if (response.status === 412 && data?.error === 'stale_revision') {
    throw new RelayRevisionConflict(Number.isSafeInteger(data.current_revision) ? data.current_revision! : null);
  }
  throw new Error(data?.detail || data?.error || `${fallback} (${response.status})`);
}

function mutationHeaders(revision: number): Record<string, string> {
  return { 'Content-Type': 'application/json', 'If-Match': `"${revision}"` };
}

export async function createRelay(revision: number, input: RelayCreateInput): Promise<RelayMutationResult> {
  return mutationOrThrow(await authFetch('/api/relays', {
    method: 'POST',
    headers: mutationHeaders(revision),
    body: JSON.stringify(input),
  }), 'Failed to add relay');
}

export async function updateRelay(revision: number, id: string, input: RelayUpdateInput): Promise<RelayMutationResult> {
  return mutationOrThrow(await authFetch(`/api/relays/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: mutationHeaders(revision),
    body: JSON.stringify(input),
  }), 'Failed to update relay');
}

export async function deleteRelay(revision: number, id: string): Promise<RelayMutationResult> {
  return mutationOrThrow(await authFetch(`/api/relays/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'If-Match': `"${revision}"` },
  }), 'Failed to delete relay');
}
