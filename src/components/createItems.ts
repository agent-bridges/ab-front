import { Terminal, FolderOpen, StickyNote, MapPin, Cable } from 'lucide-react';
import { saveItemLayout } from '../api/canvas';
import { createPty } from '../api/pty';
import type { CanvasItem, CanvasItemType } from '../types';

export const CREATE_ITEMS: { type: CanvasItemType; label: string; icon: typeof Terminal }[] = [
  { type: 'terminal', label: 'Terminal', icon: Terminal },
  { type: 'filebrowser', label: 'Files', icon: FolderOpen },
  { type: 'notes', label: 'Note', icon: StickyNote },
  { type: 'anchor', label: 'Anchor', icon: MapPin },
  { type: 'tunnels', label: 'Tunnels', icon: Cable },
];

interface CreateCanvasItemOptions {
  type: CanvasItemType;
  x: number;
  y: number;
  agentId?: string | null;
  addItem: (type: CanvasItemType, x: number, y: number, extra?: Partial<CanvasItem>) => string;
}

export async function createCanvasItemAtPosition({ type, x, y, agentId, addItem }: CreateCanvasItemOptions): Promise<void> {
  if (type === 'terminal') {
    if (!agentId) return;
    const result = await createPty({ agentId, shellOnly: true });
    if (result.ok && result.session_id) {
      saveItemLayout(`pty-${result.session_id}`, x, y, undefined, agentId);
    }
    return;
  }

  addItem(type, x, y);
}
