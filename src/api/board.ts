import { authFetch } from './client';
import { readJsonOrThrow, throwFromResponse } from './http';
import type { BoardItem, BoardItemType } from '../types';

interface CanvasBoardItem {
  id: string;
  type: string;
  label?: string;
  agentId?: string;
  noteContent?: string;
  currentPath?: string;
}

const BOARD_TYPES = new Set<BoardItemType>(['filebrowser', 'notes', 'tunnels']);

const DEFAULT_LABELS: Record<BoardItemType, string> = {
  filebrowser: 'Files',
  notes: 'Notes',
  tunnels: 'Tunnels',
};

/**
 * Older canvas entries stored their auto-resource identity in `label`, for
 * example `__auto__:filebrowser:Files`. The id remains useful internally, but
 * the technical prefix must never become user-facing text.
 */
export function boardItemLabel(type: BoardItemType, label?: string): string {
  if (!label) return DEFAULT_LABELS[type];
  const legacyPrefix = `__auto__:${type}:`;
  if (!label.startsWith(legacyPrefix)) return label;
  return label.slice(legacyPrefix.length).trim() || DEFAULT_LABELS[type];
}

export async function fetchBoardItems(agentId: string | null): Promise<BoardItem[]> {
  if (!agentId) return [];
  const response = await authFetch(`/api/canvas?agent_id=${encodeURIComponent(agentId)}`);
  const payload = await readJsonOrThrow<unknown>(response, 'Failed to fetch workspace resources');
  if (!Array.isArray(payload)) throw new Error('Failed to fetch workspace resources: invalid response');
  return payload.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Failed to fetch workspace resources: invalid item');
    }
    const item = value as CanvasBoardItem;
    if (typeof item.id !== 'string' || !item.id || typeof item.type !== 'string' || !BOARD_TYPES.has(item.type as BoardItemType)) {
      throw new Error('Failed to fetch workspace resources: invalid item');
    }
    if (item.label !== undefined && typeof item.label !== 'string') throw new Error('Failed to fetch workspace resources: invalid label');
    if (item.agentId !== undefined && typeof item.agentId !== 'string') throw new Error('Failed to fetch workspace resources: invalid agent id');
    if (item.noteContent !== undefined && typeof item.noteContent !== 'string') throw new Error('Failed to fetch workspace resources: invalid note content');
    if (item.currentPath !== undefined && typeof item.currentPath !== 'string') throw new Error('Failed to fetch workspace resources: invalid current path');
    return {
      id: item.id,
      type: item.type as BoardItemType,
      label: boardItemLabel(item.type as BoardItemType, item.label),
      agentId: item.agentId || agentId,
      noteContent: item.noteContent,
      currentPath: item.currentPath,
    };
  });
}

export async function saveBoardItem(item: BoardItem): Promise<void> {
  const response = await authFetch(`/api/canvas/${encodeURIComponent(item.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: item.type,
      label: item.label,
      agentId: item.agentId,
      noteContent: item.noteContent,
      currentPath: item.currentPath,
    }),
  });
  if (!response.ok) await throwFromResponse(response, 'Failed to save workspace resource');
}

export async function deleteBoardItem(id: string, agentId: string | null): Promise<void> {
  const query = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
  const response = await authFetch(`/api/canvas/${encodeURIComponent(id)}${query}`, { method: 'DELETE' });
  if (!response.ok) await throwFromResponse(response, 'Failed to delete workspace resource');
}
