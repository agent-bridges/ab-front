import { authFetch } from './client';
import { readJsonOrThrow, throwFromResponse } from './http';
import type { CanvasItem, WindowState } from '../types';

// === DB: item data (shared across devices) ===

function getCanvasLayoutStorageKey(agentId?: string | null) {
  return `canvas-layout:${agentId || 'global'}`;
}

function getCanvasViewportStorageKey(agentId?: string | null) {
  return `canvas-viewport:${agentId || 'global'}`;
}

export async function fetchCanvasItems(agentId?: string | null): Promise<CanvasItem[]> {
  if (!agentId) return [];
  const query = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
  const resp = await authFetch(`/api/canvas${query}`);
  const items = await readJsonOrThrow<CanvasItem[]>(resp, 'Failed to fetch canvas items');
  // Merge per-device presentation state from localStorage.
  // Board item data itself (x/y/label/content/path) comes from daemon.
  const layout = loadLayout(agentId);
  return items.map((item) => {
    const l = layout[item.id];
    if (l) {
      return {
        ...item,
        pinned: l.pinned ?? item.pinned,
        pinnedViewportX: l.pinnedViewportX ?? item.pinnedViewportX,
        pinnedViewportY: l.pinnedViewportY ?? item.pinnedViewportY,
        window: l.window,
      };
    }
    return item;
  });
}

export async function upsertCanvasItem(item: CanvasItem, agentId?: string | null): Promise<void> {
  const scopedAgentId = item.agentId ?? agentId ?? undefined;
  saveItemLayout(item.id, item.x, item.y, item.window, scopedAgentId, {
    pinned: item.pinned,
    pinnedViewportX: item.pinnedViewportX,
    pinnedViewportY: item.pinnedViewportY,
  });

  // Save shared board item data to daemon-backed backend.
  const res = await authFetch(`/api/canvas/${item.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: item.type,
      label: item.label,
      ptyId: item.ptyId,
      agentId: scopedAgentId,
      noteContent: item.noteContent,
      currentPath: item.currentPath,
    }),
  });
  if (!res.ok) await throwFromResponse(res, 'Failed to save canvas item');
}

export async function deleteCanvasItem(id: string, agentId?: string | null): Promise<void> {
  const query = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
  const res = await authFetch(`/api/canvas/${id}${query}`, { method: 'DELETE' });
  if (!res.ok) await throwFromResponse(res, 'Failed to delete canvas item');
  removeItemLayout(id, agentId);
}

export async function syncCanvasItems(items: CanvasItem[], agentId?: string | null): Promise<void> {
  const res = await authFetch('/api/canvas/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId,
      items: items.map((i) => ({
        id: i.id,
        type: i.type,
        label: i.label,
        ptyId: i.ptyId,
        agentId: i.agentId ?? agentId ?? undefined,
        noteContent: i.noteContent,
        currentPath: i.currentPath,
      })),
    }),
  });
  if (!res.ok) await throwFromResponse(res, 'Failed to sync canvas items');
  // Save all layouts locally
  const layout = loadLayout(agentId);
  for (const i of items) {
    layout[i.id] = {
      x: i.x,
      y: i.y,
      pinned: i.pinned,
      pinnedViewportX: i.pinnedViewportX,
      pinnedViewportY: i.pinnedViewportY,
      window: i.window ? { ...i.window, isOpen: false } : undefined,
    };
  }
  localStorage.setItem(getCanvasLayoutStorageKey(agentId), JSON.stringify(layout));
}

// === localStorage: per-device layout ===

interface ItemLayout {
  x: number;
  y: number;
  pinned?: boolean;
  pinnedViewportX?: number;
  pinnedViewportY?: number;
  window?: WindowState;
}

export interface CanvasViewportSnapshot {
  panX: number;
  panY: number;
  zoom: number;
}

export interface CanvasPanelSnapshot {
  visible: boolean;
  width: number;
  height: number;
  x: number | null;
  y: number | null;
}

export interface CanvasLayoutSnapshot {
  version: 1;
  items: Record<string, ItemLayout>;
  viewport: CanvasViewportSnapshot | null;
  ui?: {
    minimap?: CanvasPanelSnapshot;
    anchorsPanel?: CanvasPanelSnapshot;
  };
}

export interface CanvasLayoutSummary {
  name: string;
  agentId?: string | null;
  savedAt?: string | null;
}

export function loadLayout(agentId?: string | null): Record<string, ItemLayout> {
  try {
    return JSON.parse(localStorage.getItem(getCanvasLayoutStorageKey(agentId)) || '{}');
  } catch {
    return {};
  }
}

export function saveItemLayout(
  id: string,
  x: number,
  y: number,
  window?: WindowState,
  agentId?: string | null,
  extra?: Pick<ItemLayout, 'pinned' | 'pinnedViewportX' | 'pinnedViewportY'>,
) {
  const layout = loadLayout(agentId);
  layout[id] = {
    x,
    y,
    pinned: extra?.pinned,
    pinnedViewportX: extra?.pinnedViewportX,
    pinnedViewportY: extra?.pinnedViewportY,
    window: window ? { ...window } : undefined,
  };
  localStorage.setItem(getCanvasLayoutStorageKey(agentId), JSON.stringify(layout));
}

function removeItemLayout(id: string, agentId?: string | null) {
  const layout = loadLayout(agentId);
  delete layout[id];
  localStorage.setItem(getCanvasLayoutStorageKey(agentId), JSON.stringify(layout));
}


interface ViewportLayout {
  panX: number;
  panY: number;
  zoom: number;
}

export function loadViewport(agentId?: string | null): ViewportLayout | null {
  try {
    const raw = localStorage.getItem(getCanvasViewportStorageKey(agentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.panX !== 'number' || typeof parsed?.panY !== 'number' || typeof parsed?.zoom !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveViewport(panX: number, panY: number, zoom: number, agentId?: string | null) {
  localStorage.setItem(getCanvasViewportStorageKey(agentId), JSON.stringify({ panX, panY, zoom }));
}

export async function listCanvasLayouts(agentId?: string | null): Promise<CanvasLayoutSummary[]> {
  const query = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
  const resp = await authFetch(`/api/canvas/layouts${query}`);
  return readJsonOrThrow<CanvasLayoutSummary[]>(resp, 'Failed to list canvas layouts');
}

export async function getCanvasLayoutSnapshot(name: string, agentId?: string | null): Promise<CanvasLayoutSnapshot> {
  const query = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
  const resp = await authFetch(`/api/canvas/layouts/${encodeURIComponent(name)}${query}`);
  const payload = await readJsonOrThrow<{ snapshot: CanvasLayoutSnapshot }>(resp, 'Failed to load canvas layout');
  return payload.snapshot;
}

export async function saveCanvasLayoutSnapshot(name: string, snapshot: CanvasLayoutSnapshot, agentId?: string | null): Promise<void> {
  const res = await authFetch(`/api/canvas/layouts/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agentId,
      snapshot,
    }),
  });
  if (!res.ok) await throwFromResponse(res, 'Failed to save canvas layout');
}

export async function deleteCanvasLayoutSnapshot(name: string, agentId?: string | null): Promise<void> {
  const query = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
  const res = await authFetch(`/api/canvas/layouts/${encodeURIComponent(name)}${query}`, {
    method: 'DELETE',
  });
  if (!res.ok) await throwFromResponse(res, 'Failed to delete canvas layout');
}

// === IDE-view persistence (per-agent in localStorage) ===
//
// View mode, sort, sidebar width, and open tab list are device-local UX state.

import type { IdeSortMode, ViewMode, IdeGroup, IdeGroupSizes } from '../types';

interface IdePrefs {
  mode: ViewMode;
  sort: IdeSortMode;
  sidebarWidth: number;
  /** Open tabs in the main pane. Entries can be canvas item ids OR group ids ("group:xxx"). */
  openTabIds: string[];
  /** Focused tab id (item or group). */
  focusedItemId: string | null;
  /** All groups defined for this agent. */
  groups: IdeGroup[];
}

/**
 * Normalize a persisted group `sizes` value to the current `IdeGroupSizes` shape.
 * Accepts the legacy flat `number[]` (wraps as `{ outer }`), or the current
 * `{ outer, inner? }` shape. Anything else returns an empty placeholder, which
 * the store will rebuild via buildDefaultSizes on next interaction.
 */
function normalizeGroupSizes(raw: unknown): IdeGroupSizes {
  if (Array.isArray(raw) && raw.every((n) => typeof n === 'number')) {
    return { outer: raw as number[] };
  }
  if (raw && typeof raw === 'object') {
    const r = raw as { outer?: unknown; inner?: unknown };
    const outer = Array.isArray(r.outer) && r.outer.every((n) => typeof n === 'number') ? (r.outer as number[]) : [];
    const inner = Array.isArray(r.inner)
      ? (r.inner as unknown[]).filter((row): row is number[] => Array.isArray(row) && row.every((n) => typeof n === 'number'))
      : undefined;
    return inner ? { outer, inner } : { outer };
  }
  return { outer: [] };
}

const IDE_PREFS_DEFAULT: IdePrefs = {
  mode: 'canvas',
  sort: 'type',
  sidebarWidth: 240,
  openTabIds: [],
  focusedItemId: null,
  groups: [],
};

function getIdePrefsKey(agentId?: string | null) {
  return `canvas-ide-prefs:${agentId || 'global'}`;
}

export function loadIdePrefs(agentId?: string | null): IdePrefs {
  try {
    const raw = localStorage.getItem(getIdePrefsKey(agentId));
    if (!raw) return { ...IDE_PREFS_DEFAULT };
    const parsed = JSON.parse(raw);
    const groups: IdeGroup[] = Array.isArray(parsed.groups)
      ? parsed.groups
          .filter((g: unknown): g is Omit<IdeGroup, 'sizes'> & { sizes: unknown } => {
            if (!g || typeof g !== 'object') return false;
            const gg = g as Partial<IdeGroup>;
            return typeof gg.id === 'string'
              && typeof gg.name === 'string'
              && Array.isArray(gg.members)
              && typeof gg.layout === 'string';
          })
          .map((g: Omit<IdeGroup, 'sizes'> & { sizes: unknown }): IdeGroup => ({
            ...g,
            sizes: normalizeGroupSizes(g.sizes),
          }))
      : [];
    return {
      mode: parsed.mode === 'ide' ? 'ide' : 'canvas',
      sort: ['type', 'name', 'recent', 'status'].includes(parsed.sort) ? parsed.sort : 'type',
      sidebarWidth: typeof parsed.sidebarWidth === 'number' ? parsed.sidebarWidth : 240,
      openTabIds: Array.isArray(parsed.openTabIds) ? parsed.openTabIds.filter((s: unknown) => typeof s === 'string') : [],
      focusedItemId: typeof parsed.focusedItemId === 'string' ? parsed.focusedItemId : null,
      groups,
    };
  } catch {
    return { ...IDE_PREFS_DEFAULT };
  }
}

export function saveIdePrefs(agentId: string | null | undefined, patch: Partial<IdePrefs>) {
  if (!agentId) return;
  const current = loadIdePrefs(agentId);
  const next = { ...current, ...patch };
  localStorage.setItem(getIdePrefsKey(agentId), JSON.stringify(next));
}
