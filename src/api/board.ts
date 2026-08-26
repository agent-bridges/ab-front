import { authFetch } from './client';
import { readJsonOrThrow, throwFromResponse } from './http';
import type { BoardItem, BoardItemType } from '../types';

interface LegacyBoardItem {
  id: string;
  type: string;
  label?: string;
  agentId?: string;
  noteContent?: string;
  currentPath?: string;
}

const BOARD_TYPES = new Set<BoardItemType>(['filebrowser', 'notes', 'tunnels']);

export async function fetchBoardItems(agentId: string | null): Promise<BoardItem[]> {
  if (!agentId) return [];
  const response = await authFetch(`/api/canvas?agent_id=${encodeURIComponent(agentId)}`);
  if (response.status === 404) return [];
  const items = await readJsonOrThrow<LegacyBoardItem[]>(response, 'Failed to fetch workspace resources');
  return items
    .filter((item): item is LegacyBoardItem & { type: BoardItemType } => BOARD_TYPES.has(item.type as BoardItemType))
    .map((item) => ({
      id: item.id,
      type: item.type,
      label: item.label || (item.type === 'filebrowser' ? 'Files' : item.type === 'notes' ? 'Notes' : 'Tunnels'),
      agentId: item.agentId || agentId,
      noteContent: item.noteContent,
      currentPath: item.currentPath,
    }));
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
