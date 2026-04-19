import { create } from 'zustand';
import type { CanvasItem, CanvasItemType, WindowState, PtySession } from '../types';
import {
  fetchCanvasItems,
  upsertCanvasItem,
  deleteCanvasItem,
  saveItemLayout,
  loadLayout,
  loadViewport,
  saveViewport,
  saveCanvasLayoutSnapshot,
  getCanvasLayoutSnapshot,
  type CanvasLayoutSnapshot,
} from '../api/canvas';
import { killPty, updatePtyMeta } from '../api/pty';
import { getViewportSpawnPosition } from '../utils/canvasViewport';
import { getPathLeafForTitle, isAutoLabel, makeAutoLabel } from '../utils/canvasItemTitle';

const GRID = 80;
const WORLD_MIN = -3000;
const WORLD_MAX = 8000;
function snap(v: number) { return Math.round(v / GRID) * GRID; }
function clampPos(v: number) { return Math.max(WORLD_MIN, Math.min(WORLD_MAX, v)); }
function safeSnap(v: number) { return snap(clampPos(v)); }
const TOOLBAR_H = 40;
const WORLD_ORIGIN = 4000;
const DEFAULT_MINIMAP = { visible: true, width: 196, height: 140, x: null as number | null, y: null as number | null };
const DEFAULT_ANCHORS_PANEL = { visible: true, width: 240, height: 220, x: null as number | null, y: null as number | null };
const MINIMAP_MIN_W = 160;
const MINIMAP_MIN_H = 120;
const ANCHORS_PANEL_MIN_W = 220;
const ANCHORS_PANEL_MIN_H = 140;
const DEFAULT_LAYOUT_SCOPE = 'viewport' as const;
const DEFAULT_RULER_LEFT = 96;
const DEFAULT_RULER_RIGHT = 96;
const DEFAULT_RULER_TOP = 72;
const DEFAULT_RULER_BOTTOM = 72;

export type LayoutScope = 'viewport' | 'world' | 'rulers';
function getIsMobileViewport() {
  return typeof window !== 'undefined' && window.innerWidth < 768;
}

function getItemViewportPosition(item: CanvasItem, panX: number, panY: number, zoom: number) {
  if (getIsMobileViewport()) {
    return {
      x: item.x * zoom + panX,
      y: item.y * zoom + panY,
    };
  }

  return {
    x: (WORLD_ORIGIN + item.x) * zoom - panX,
    y: (WORLD_ORIGIN + item.y) * zoom - panY,
  };
}

function getWorldPositionForPinned(viewportX: number, viewportY: number, panX: number, panY: number, zoom: number) {
  if (getIsMobileViewport()) {
    return {
      x: (viewportX - panX) / zoom,
      y: (viewportY - panY) / zoom,
    };
  }

  return {
    x: (viewportX + panX) / zoom - WORLD_ORIGIN,
    y: (viewportY + panY) / zoom - WORLD_ORIGIN,
  };
}

let topZ = 10;

const DEFAULT_WINDOW_SIZES: Record<CanvasItemType, { w: number; h: number }> = {
  terminal: { w: 720, h: 480 },
  filebrowser: { w: 500, h: 500 },
  notes: { w: 450, h: 400 },
  anchor: { w: 320, h: 240 },
};

function getMinimapStorageKey(agentId?: string | null) {
  return `ab2:minimap:${agentId || 'global'}`;
}

function getAnchorsPanelStorageKey(agentId?: string | null) {
  return `ab2:anchors-panel:${agentId || 'global'}`;
}

function getWorkspaceUiStorageKey(agentId?: string | null) {
  return `ab2:workspace-ui:${agentId || 'global'}`;
}

function loadMinimapPrefs(agentId?: string | null) {
  try {
    const raw = localStorage.getItem(getMinimapStorageKey(agentId));
    if (!raw) return DEFAULT_MINIMAP;
    const parsed = JSON.parse(raw);
    const { width, height } = clampMinimapSize(Number(parsed.width) || DEFAULT_MINIMAP.width, Number(parsed.height) || DEFAULT_MINIMAP.height);
    return {
      visible: parsed.visible !== false,
      width,
      height,
      x: Number.isFinite(parsed.x) ? Number(parsed.x) : null,
      y: Number.isFinite(parsed.y) ? Number(parsed.y) : null,
    };
  } catch {
    return DEFAULT_MINIMAP;
  }
}

function clampMinimapSize(width: number, height: number) {
  if (typeof window === 'undefined') {
    return {
      width: Math.max(MINIMAP_MIN_W, width),
      height: Math.max(MINIMAP_MIN_H, height),
    };
  }

  const maxWidth = Math.max(MINIMAP_MIN_W, window.innerWidth - 24);
  const maxHeight = Math.max(MINIMAP_MIN_H, window.innerHeight - 64);
  return {
    width: Math.max(MINIMAP_MIN_W, Math.min(maxWidth, width)),
    height: Math.max(MINIMAP_MIN_H, Math.min(maxHeight, height)),
  };
}

function saveMinimapPrefs(visible: boolean, width: number, height: number, x: number | null, y: number | null, agentId?: string | null) {
  try {
    const next = clampMinimapSize(width, height);
    localStorage.setItem(getMinimapStorageKey(agentId), JSON.stringify({
      visible,
      width: next.width,
      height: next.height,
      x,
      y,
    }));
  } catch {
    // ignore storage failures
  }
}

const initialMinimap = DEFAULT_MINIMAP;

function clampAnchorsPanelSize(width: number, height: number) {
  if (typeof window === 'undefined') {
    return {
      width: Math.max(ANCHORS_PANEL_MIN_W, width),
      height: Math.max(ANCHORS_PANEL_MIN_H, height),
    };
  }

  const maxWidth = Math.max(ANCHORS_PANEL_MIN_W, window.innerWidth - 24);
  const maxHeight = Math.max(ANCHORS_PANEL_MIN_H, window.innerHeight - 64);
  return {
    width: Math.max(ANCHORS_PANEL_MIN_W, Math.min(maxWidth, width)),
    height: Math.max(ANCHORS_PANEL_MIN_H, Math.min(maxHeight, height)),
  };
}

function loadAnchorsPanelPrefs(agentId?: string | null) {
  try {
    const raw = localStorage.getItem(getAnchorsPanelStorageKey(agentId));
    if (!raw) return DEFAULT_ANCHORS_PANEL;
    const parsed = JSON.parse(raw);
    const { width, height } = clampAnchorsPanelSize(
      Number(parsed.width) || DEFAULT_ANCHORS_PANEL.width,
      Number(parsed.height) || DEFAULT_ANCHORS_PANEL.height,
    );
    return {
      visible: parsed.visible !== false,
      width,
      height,
      x: Number.isFinite(parsed.x) ? Number(parsed.x) : null,
      y: Number.isFinite(parsed.y) ? Number(parsed.y) : null,
    };
  } catch {
    return DEFAULT_ANCHORS_PANEL;
  }
}

function saveAnchorsPanelPrefs(visible: boolean, width: number, height: number, x: number | null, y: number | null, agentId?: string | null) {
  try {
    const next = clampAnchorsPanelSize(width, height);
    localStorage.setItem(getAnchorsPanelStorageKey(agentId), JSON.stringify({
      visible,
      width: next.width,
      height: next.height,
      x,
      y,
    }));
  } catch {
    // ignore storage failures
  }
}

const initialAnchorsPanel = DEFAULT_ANCHORS_PANEL;

interface WorkspaceUiPrefs {
  layoutScope: LayoutScope;
  rulerLeft: number;
  rulerRight: number;
  rulerTop: number;
  rulerBottom: number;
}

function loadWorkspaceUiPrefs(agentId?: string | null): WorkspaceUiPrefs {
  try {
    const raw = localStorage.getItem(getWorkspaceUiStorageKey(agentId));
    if (!raw) {
      return {
        layoutScope: DEFAULT_LAYOUT_SCOPE,
        rulerLeft: DEFAULT_RULER_LEFT,
        rulerRight: DEFAULT_RULER_RIGHT,
        rulerTop: DEFAULT_RULER_TOP,
        rulerBottom: DEFAULT_RULER_BOTTOM,
      };
    }
    const parsed = JSON.parse(raw);
    return {
      layoutScope: parsed.layoutScope === 'world' || parsed.layoutScope === 'rulers' ? parsed.layoutScope : DEFAULT_LAYOUT_SCOPE,
      rulerLeft: Math.max(0, Number(parsed.rulerLeft) || DEFAULT_RULER_LEFT),
      rulerRight: Math.max(0, Number(parsed.rulerRight) || DEFAULT_RULER_RIGHT),
      rulerTop: Math.max(0, Number(parsed.rulerTop) || DEFAULT_RULER_TOP),
      rulerBottom: Math.max(0, Number(parsed.rulerBottom) || DEFAULT_RULER_BOTTOM),
    };
  } catch {
    return {
      layoutScope: DEFAULT_LAYOUT_SCOPE,
      rulerLeft: DEFAULT_RULER_LEFT,
      rulerRight: DEFAULT_RULER_RIGHT,
      rulerTop: DEFAULT_RULER_TOP,
      rulerBottom: DEFAULT_RULER_BOTTOM,
    };
  }
}

function saveWorkspaceUiPrefs(
  layoutScope: LayoutScope,
  rulerLeft: number,
  rulerRight: number,
  rulerTop: number,
  rulerBottom: number,
  agentId?: string | null,
) {
  try {
    localStorage.setItem(getWorkspaceUiStorageKey(agentId), JSON.stringify({
      layoutScope,
      rulerLeft,
      rulerRight,
      rulerTop,
      rulerBottom,
    }));
  } catch {
    // ignore storage failures
  }
}

const initialWorkspaceUi = {
  layoutScope: DEFAULT_LAYOUT_SCOPE,
  rulerLeft: DEFAULT_RULER_LEFT,
  rulerRight: DEFAULT_RULER_RIGHT,
  rulerTop: DEFAULT_RULER_TOP,
  rulerBottom: DEFAULT_RULER_BOTTOM,
};

function buildCanvasLayoutSnapshot(state: Pick<
  CanvasState,
  | 'items'
  | 'panX'
  | 'panY'
  | 'zoom'
  | 'minimapVisible'
  | 'minimapWidth'
  | 'minimapHeight'
  | 'minimapX'
  | 'minimapY'
  | 'anchorsPanelVisible'
  | 'anchorsPanelWidth'
  | 'anchorsPanelHeight'
  | 'anchorsPanelX'
  | 'anchorsPanelY'
>): CanvasLayoutSnapshot {
  return {
    version: 1,
    items: Object.fromEntries(
      state.items.map((item) => [
        item.id,
        {
          x: item.x,
          y: item.y,
          pinned: item.pinned,
          pinnedViewportX: item.pinnedViewportX,
          pinnedViewportY: item.pinnedViewportY,
          window: item.window ? { ...item.window } : undefined,
        },
      ]),
    ),
    viewport: {
      panX: state.panX,
      panY: state.panY,
      zoom: state.zoom,
    },
    ui: {
      minimap: {
        visible: state.minimapVisible,
        width: state.minimapWidth,
        height: state.minimapHeight,
        x: state.minimapX,
        y: state.minimapY,
      },
      anchorsPanel: {
        visible: state.anchorsPanelVisible,
        width: state.anchorsPanelWidth,
        height: state.anchorsPanelHeight,
        x: state.anchorsPanelX,
        y: state.anchorsPanelY,
      },
    },
  };
}

function sanitizeSnapshotWindow(item: CanvasItem, windowState: WindowState | undefined): WindowState | undefined {
  if (!windowState) return undefined;
  if (item.type === 'terminal' && item.ptyAlive === false) {
    return {
      ...windowState,
      isOpen: false,
      isMinimized: false,
    };
  }
  return windowState;
}

// Debounced save to DB
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
function getScopedSaveKey(itemId: string, agentId?: string | null) {
  return `${agentId || 'global'}:${itemId}`;
}

function debouncedSave(item: CanvasItem, scopedAgentId?: string | null) {
  const agentId = scopedAgentId ?? item.agentId ?? useCanvasStore.getState().boardAgentId;
  const saveKey = getScopedSaveKey(item.id, agentId);
  const existing = saveTimers.get(saveKey);
  if (existing) clearTimeout(existing);
  saveTimers.set(saveKey, setTimeout(() => {
    saveTimers.delete(saveKey);
    upsertCanvasItem(item, agentId).catch((e) => console.error('Failed to save canvas item:', e));
  }, 500));
}

function saveItem(id: string) {
  const state = useCanvasStore.getState();
  const item = state.items.find((i) => i.id === id);
  if (item) debouncedSave(item, item.agentId ?? state.boardAgentId);
}

function getViewportBounds(panX: number, panY: number, zoom: number) {
  const isMobileViewport = window.innerWidth < 768;
  if (isMobileViewport) {
    return {
      x: 0,
      y: TOOLBAR_H,
      w: window.innerWidth,
      h: Math.max(0, window.innerHeight - TOOLBAR_H),
    };
  }

  return {
    x: panX / zoom - WORLD_ORIGIN,
    y: panY / zoom - WORLD_ORIGIN,
    w: window.innerWidth / zoom,
    h: Math.max(0, (window.innerHeight - TOOLBAR_H) / zoom),
  };
}

interface LayoutGeometryState {
  panX: number;
  panY: number;
  zoom: number;
  rulerLeft: number;
  rulerRight: number;
  rulerTop: number;
  rulerBottom: number;
}

function getLayoutBounds(scope: LayoutScope, state: LayoutGeometryState) {
  const viewport = getViewportBounds(state.panX, state.panY, state.zoom);
  if (scope !== 'rulers') {
    return viewport;
  }

  const width = Math.max(320 / state.zoom, viewport.w - (state.rulerLeft + state.rulerRight) / state.zoom);
  const height = Math.max(240 / state.zoom, viewport.h - (state.rulerTop + state.rulerBottom) / state.zoom);

  return {
    x: viewport.x + state.rulerLeft / state.zoom,
    y: viewport.y + state.rulerTop / state.zoom,
    w: width,
    h: height,
  };
}

function rectsIntersect(
  ax1: number,
  ay1: number,
  ax2: number,
  ay2: number,
  bx1: number,
  by1: number,
  bx2: number,
  by2: number,
) {
  return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1;
}

function shouldIncludeWindow(item: CanvasItem, scope: LayoutScope, state: LayoutGeometryState) {
  if (!item.window) return false;
  if (scope === 'world') return true;

  const viewport = getViewportBounds(state.panX, state.panY, state.zoom);
  const x1 = item.window.x;
  const y1 = item.window.y;
  const x2 = item.window.x + item.window.w;
  const y2 = item.window.y + item.window.h;
  const vx1 = viewport.x;
  const vy1 = viewport.y;
  const vx2 = viewport.x + viewport.w;
  const vy2 = viewport.y + viewport.h;

  return rectsIntersect(x1, y1, x2, y2, vx1, vy1, vx2, vy2);
}

function shouldIncludeItemInScope(item: CanvasItem, scope: LayoutScope, state: LayoutGeometryState) {
  if (scope === 'world') return true;

  const viewport = getViewportBounds(state.panX, state.panY, state.zoom);
  const windowIntersects = shouldIncludeWindow(item, 'viewport', state);
  if (windowIntersects) return true;

  const x1 = item.x;
  const y1 = item.y;
  const x2 = item.x + GRID;
  const y2 = item.y + GRID;
  const vx1 = viewport.x;
  const vy1 = viewport.y;
  const vx2 = viewport.x + viewport.w;
  const vy2 = viewport.y + viewport.h;

  return rectsIntersect(x1, y1, x2, y2, vx1, vy1, vx2, vy2);
}

function normalizeLegacyAutoLabel(item: CanvasItem): CanvasItem {
  if (isAutoLabel(item.label)) return item;

  if (item.type === 'filebrowser' && (!item.label || item.label === 'Files')) {
    return { ...item, label: makeAutoLabel('filebrowser', 'Files') };
  }

  if (item.type === 'notes' && (!item.label || item.label === 'Notes' || item.label === 'Note')) {
    return { ...item, label: makeAutoLabel('notes', 'Notes') };
  }

  if (item.type === 'anchor' && (!item.label || item.label === 'Anchor')) {
    return { ...item, label: makeAutoLabel('anchor', 'Anchor') };
  }

  if (item.type === 'terminal' && (!item.label || item.label === 'Terminal')) {
    return { ...item, label: makeAutoLabel('terminal', 'Terminal') };
  }

  return item;
}

function getTerminalAutoBase(session: PtySession): string {
  const cwd = session.last_cwd || session.project_path || '';
  if (cwd) return getPathLeafForTitle(cwd);
  if (session.project_name) return session.project_name;
  if (session.label) return session.label;
  if (session.name) return session.name;
  return 'Terminal';
}

interface CanvasState {
  boardAgentId: string | null;
  items: CanvasItem[];
  selectedItemIds: string[];
  focusedAnchorId: string | null;
  draggingItemIds: string[];
  draggingWindowId: string | null;
  panX: number;
  panY: number;
  zoom: number;
  minimapVisible: boolean;
  minimapWidth: number;
  minimapHeight: number;
  minimapX: number | null;
  minimapY: number | null;
  anchorsPanelVisible: boolean;
  anchorsPanelWidth: number;
  anchorsPanelHeight: number;
  anchorsPanelX: number | null;
  anchorsPanelY: number | null;
  layoutScope: LayoutScope;
  rulerLeft: number;
  rulerRight: number;
  rulerTop: number;
  rulerBottom: number;
  loaded: boolean;

  loadItems: (agentId: string | null) => Promise<void>;
  syncTerminals: (sessions: PtySession[], agentId: string) => void;
  addItem: (type: CanvasItemType, x: number, y: number, extra?: Partial<CanvasItem>) => string;
  removeItem: (id: string) => Promise<void>;
  moveItem: (id: string, x: number, y: number) => void;
  moveItems: (positions: Record<string, { x: number; y: number }>) => void;
  updateItem: (id: string, patch: Partial<CanvasItem>) => void;
  toggleSelectedItem: (id: string) => void;
  setSelectedItems: (ids: string[]) => void;
  clearSelectedItems: () => void;
  setFocusedAnchor: (id: string | null) => void;
  focusAnchor: (id: string) => void;
  startDraggingItems: (ids: string[]) => void;
  stopDraggingItems: () => void;
  startDraggingWindow: (id: string) => void;
  stopDraggingWindow: () => void;
  toggleItemPinned: (id: string) => void;
  movePinnedItemViewport: (id: string, viewportX: number, viewportY: number) => void;
  setPan: (x: number, y: number) => void;
  setZoom: (z: number) => void;
  setMinimapVisible: (visible: boolean) => void;
  setMinimapSize: (width: number, height: number) => void;
  setMinimapPosition: (x: number, y: number) => void;
  setAnchorsPanelVisible: (visible: boolean) => void;
  setAnchorsPanelSize: (width: number, height: number) => void;
  setAnchorsPanelPosition: (x: number, y: number) => void;
  cycleLayoutScope: () => void;
  setRulerEdge: (edge: 'left' | 'right' | 'top' | 'bottom', value: number) => void;
  saveLayoutSnapshotToServer: (name: string) => Promise<void>;
  loadLayoutSnapshotFromServer: (name: string) => Promise<void>;

  openWindow: (id: string) => void;
  closeWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  moveWindow: (id: string, x: number, y: number) => void;
  resizeWindow: (id: string, w: number, h: number) => void;
  tileWindows: (mode: 'columns' | 'rows' | 'grid', scope?: LayoutScope) => void;
  fitAllWindows: (scope?: LayoutScope) => void;
  minimizeAllWindows: (scope?: LayoutScope) => void;
  closeAllWindows: (scope?: LayoutScope) => void;
  toggleWindowLocked: (id: string) => void;
  moveLockedWindow: (id: string, viewportX: number, viewportY: number) => void;
}

let nextId = Date.now();

interface BoardRuntimeSnapshot {
  items: CanvasItem[];
}

const boardRuntimeCache = new Map<string, BoardRuntimeSnapshot>();

function cloneCanvasItem(item: CanvasItem): CanvasItem {
  return {
    ...item,
    window: item.window ? { ...item.window } : undefined,
    ptyProcesses: item.ptyProcesses ? item.ptyProcesses.map((proc) => ({ ...proc })) : undefined,
  };
}

function loadBoardRuntimeSnapshot(agentId?: string | null): BoardRuntimeSnapshot | null {
  if (!agentId) return null;
  const snapshot = boardRuntimeCache.get(agentId);
  if (!snapshot) return null;
  return {
    items: snapshot.items.map(cloneCanvasItem),
  };
}

function saveBoardRuntimeSnapshot(agentId: string | null, items: CanvasItem[]) {
  if (!agentId) return;
  boardRuntimeCache.set(agentId, {
    items: items.map(cloneCanvasItem),
  });
}

/** Apply localStorage coordinates to PTY items. Items without saved coords get defaults. */
function applyLayoutToItems(ptyItems: CanvasItem[], agentId: string): CanvasItem[] {
  const layout = loadLayout(agentId);
  return ptyItems.map((rawItem) => {
    const item = normalizeLegacyAutoLabel({
      ...rawItem,
      agentId: rawItem.agentId || agentId,
    });
    const saved = layout[item.id];
    return {
      ...item,
      x: saved?.x ?? item.x ?? 0,
      y: saved?.y ?? item.y ?? 0,
      window: saved?.window || item.window || undefined,
      pinned: saved?.pinned ?? item.pinned,
      pinnedViewportX: saved?.pinnedViewportX ?? item.pinnedViewportX,
      pinnedViewportY: saved?.pinnedViewportY ?? item.pinnedViewportY,
    };
  });
}

/** Remove localStorage layout entries for items that no longer exist. */
function cleanStaleLayout(agentId: string, currentItems: CanvasItem[]) {
  const layout = loadLayout(agentId);
  const validIds = new Set(currentItems.map((i) => i.id));
  let changed = false;
  for (const key of Object.keys(layout)) {
    if (!validIds.has(key)) {
      delete layout[key];
      changed = true;
    }
  }
  if (changed) {
    localStorage.setItem(`canvas-layout:${agentId}`, JSON.stringify(layout));
  }
}

export const useCanvasStore = create<CanvasState>()(
  (set, get) => ({
    boardAgentId: null,
    items: [],
    selectedItemIds: [],
    focusedAnchorId: null,
    draggingItemIds: [],
    draggingWindowId: null,
    panX: 0,
    panY: 0,
    zoom: 1,
    minimapVisible: initialMinimap.visible,
    minimapWidth: initialMinimap.width,
    minimapHeight: initialMinimap.height,
    minimapX: initialMinimap.x,
    minimapY: initialMinimap.y,
    anchorsPanelVisible: initialAnchorsPanel.visible,
    anchorsPanelWidth: initialAnchorsPanel.width,
    anchorsPanelHeight: initialAnchorsPanel.height,
    anchorsPanelX: initialAnchorsPanel.x,
    anchorsPanelY: initialAnchorsPanel.y,
    layoutScope: initialWorkspaceUi.layoutScope,
    rulerLeft: initialWorkspaceUi.rulerLeft,
    rulerRight: initialWorkspaceUi.rulerRight,
    rulerTop: initialWorkspaceUi.rulerTop,
    rulerBottom: initialWorkspaceUi.rulerBottom,
    loaded: false,

    loadItems: async (agentId) => {
      const resetState = {
        selectedItemIds: [] as string[],
        focusedAnchorId: null as string | null,
        draggingItemIds: [] as string[],
        draggingWindowId: null as string | null,
      };

      if (!agentId) {
        set({
          boardAgentId: null,
          items: [],
          ...resetState,
          panX: 0, panY: 0, zoom: 1,
          minimapVisible: DEFAULT_MINIMAP.visible, minimapWidth: DEFAULT_MINIMAP.width,
          minimapHeight: DEFAULT_MINIMAP.height, minimapX: DEFAULT_MINIMAP.x, minimapY: DEFAULT_MINIMAP.y,
          anchorsPanelVisible: DEFAULT_ANCHORS_PANEL.visible, anchorsPanelWidth: DEFAULT_ANCHORS_PANEL.width,
          anchorsPanelHeight: DEFAULT_ANCHORS_PANEL.height, anchorsPanelX: DEFAULT_ANCHORS_PANEL.x, anchorsPanelY: DEFAULT_ANCHORS_PANEL.y,
          layoutScope: DEFAULT_LAYOUT_SCOPE,
          rulerLeft: DEFAULT_RULER_LEFT, rulerRight: DEFAULT_RULER_RIGHT,
          rulerTop: DEFAULT_RULER_TOP, rulerBottom: DEFAULT_RULER_BOTTOM,
          loaded: true,
        });
        return;
      }

      const viewport = loadViewport(agentId);
      const minimapPrefs = loadMinimapPrefs(agentId);
      const anchorsPanelPrefs = loadAnchorsPanelPrefs(agentId);
      const workspaceUiPrefs = loadWorkspaceUiPrefs(agentId);

      const uiState = {
        panX: viewport?.panX ?? 0, panY: viewport?.panY ?? 0, zoom: viewport?.zoom ?? 1,
        minimapVisible: minimapPrefs.visible, minimapWidth: minimapPrefs.width,
        minimapHeight: minimapPrefs.height, minimapX: minimapPrefs.x, minimapY: minimapPrefs.y,
        anchorsPanelVisible: anchorsPanelPrefs.visible, anchorsPanelWidth: anchorsPanelPrefs.width,
        anchorsPanelHeight: anchorsPanelPrefs.height, anchorsPanelX: anchorsPanelPrefs.x, anchorsPanelY: anchorsPanelPrefs.y,
        layoutScope: workspaceUiPrefs.layoutScope,
        rulerLeft: workspaceUiPrefs.rulerLeft, rulerRight: workspaceUiPrefs.rulerRight,
        rulerTop: workspaceUiPrefs.rulerTop, rulerBottom: workspaceUiPrefs.rulerBottom,
      };

      // Step 1: show from cache instantly
      const cachedSnapshot = loadBoardRuntimeSnapshot(agentId);
      set({
        boardAgentId: agentId,
        items: cachedSnapshot?.items ?? [],
        ...resetState,
        ...uiState,
        loaded: false,
      });

      // Step 2: fetch real items from PTY
      try {
        const ptyItems = await fetchCanvasItems(agentId);
        if (get().boardAgentId !== agentId) return;

        const finalItems = applyLayoutToItems(ptyItems, agentId);

        // Clean stale entries from localStorage
        cleanStaleLayout(agentId, finalItems);

        // Full cache replacement
        saveBoardRuntimeSnapshot(agentId, finalItems);

        set({
          boardAgentId: agentId,
          items: finalItems,
          ...resetState,
          ...uiState,
          loaded: true,
        });
      } catch (e) {
        console.error('Failed to load canvas items:', e);
        if (get().boardAgentId !== agentId) return;
        // Keep cache as-is, just mark loaded
        set({ loaded: true });
      }
    },

    syncTerminals: (sessions, agentId) => {
      if (!agentId || get().boardAgentId !== agentId) return;
      const currentItems = get().items;
      const sessionMap = new Map(sessions.map((s) => [s.id, s]));

      // Keep non-terminal items as-is.
      // For terminals: keep only those that have a live session.
      const kept: CanvasItem[] = [];
      for (const item of currentItems) {
        if (item.type !== 'terminal' || !item.ptyId) {
          kept.push(item);
          continue;
        }
        const session = sessionMap.get(item.ptyId);
        if (!session) continue; // dead terminal — drop it
        sessionMap.delete(item.ptyId);
        kept.push({
          ...item,
          label: isAutoLabel(item.label) ? makeAutoLabel('terminal', getTerminalAutoBase(session)) : item.label,
          currentPath: session.last_cwd || session.project_path || item.currentPath,
          ptyProcesses: session.processes || [],
          ptyAlive: session.alive,
          aiStatus: session.ai_status || '',
        });
      }

      // Add new sessions not yet on canvas
      const layout = loadLayout(agentId);
      for (const [, session] of sessionMap) {
        const id = `pty-${session.id}`;
        const saved = layout[id];
        const idx = kept.length;
        const isMobileNow = window.innerWidth < 768;
        const spawn = saved
          ? { x: saved.x, y: saved.y }
          : isMobileNow
            ? { x: 100 + (idx % 5) * 200, y: 100 + Math.floor(idx / 5) * 200 }
            : getViewportSpawnPosition({
                panX: get().panX, panY: get().panY, zoom: get().zoom,
                index: idx, isMobile: false,
                canvasRoot: document.querySelector<HTMLElement>('[data-canvas-root="true"]'),
              });
        kept.push({
          id, type: 'terminal',
          x: safeSnap(spawn.x), y: safeSnap(spawn.y),
          label: makeAutoLabel('terminal', getTerminalAutoBase(session)),
          ptyId: session.id, agentId,
          currentPath: session.last_cwd || session.project_path || undefined,
          window: saved?.window,
          ptyProcesses: session.processes || [],
          ptyAlive: session.alive,
          aiStatus: session.ai_status || '',
        });
        debouncedSave(kept[kept.length - 1]);
      }

      // Full replacement of items + cache
      saveBoardRuntimeSnapshot(agentId, kept);
      set({ items: kept });
    },

    addItem: (type, x, y, extra) => {
      const id = `item-${nextId++}`;
      const labels: Record<CanvasItemType, string> = {
        terminal: 'Terminal',
        filebrowser: 'Files',
        notes: 'Notes',
        anchor: 'Anchor',
      };
      const item: CanvasItem = {
        id,
        type,
        x: safeSnap(x),
        y: safeSnap(y),
        label: makeAutoLabel(type, labels[type]),
        agentId: get().boardAgentId || undefined,
        ...extra,
      };
      set((s) => ({ items: [...s.items, item] }));
      debouncedSave(item);
      return id;
    },

    removeItem: async (id) => {
      const item = get().items.find((i) => i.id === id);
      if (!item) return;

      // For terminals: kill the PTY process first, only remove from canvas on success
      if (item.type === 'terminal' && item.ptyId && item.agentId) {
        try {
          await killPty(item.agentId, item.ptyId);
        } catch (e) {
          console.error('Failed to kill PTY:', e);
          return; // kill failed — keep the icon
        }
      } else {
        try {
          await deleteCanvasItem(id, get().boardAgentId);
        } catch (e) {
          console.error('Failed to delete canvas item:', e);
          return;
        }
      }

      set((s) => ({
        items: s.items.filter((i) => i.id !== id),
        selectedItemIds: s.selectedItemIds.filter((selectedId) => selectedId !== id),
        focusedAnchorId: s.focusedAnchorId === id ? null : s.focusedAnchorId,
      }));
    },

    moveItem: (id, x, y) => {
      const sx = safeSnap(x), sy = safeSnap(y);
      set((s) => ({
        items: s.items.map((i) => {
          if (i.id !== id) return i;
          if (!i.pinned) return { ...i, x: sx, y: sy };
          const viewport = getItemViewportPosition({ ...i, x: sx, y: sy }, get().panX, get().panY, get().zoom);
          return { ...i, x: sx, y: sy, pinnedViewportX: viewport.x, pinnedViewportY: viewport.y };
        }),
      }));
      const item = get().items.find((i) => i.id === id);
      if (item) {
        saveItemLayout(id, sx, sy, item.window, get().boardAgentId, {
          pinned: item.pinned,
          pinnedViewportX: item.pinnedViewportX,
          pinnedViewportY: item.pinnedViewportY,
        });
        saveItem(id);
      }
    },

    moveItems: (positions) => {
      const currentItems = get().items;
      const snappedPositions = Object.fromEntries(
        Object.entries(positions).map(([id, pos]) => [id, { x: safeSnap(pos.x), y: safeSnap(pos.y) }]),
      );

      set((s) => ({
        items: s.items.map((item) => {
          const next = snappedPositions[item.id];
          if (!next) return item;
          if (!item.pinned) return { ...item, x: next.x, y: next.y };
          const viewport = getItemViewportPosition({ ...item, x: next.x, y: next.y }, get().panX, get().panY, get().zoom);
          return {
            ...item,
            x: next.x,
            y: next.y,
            pinnedViewportX: viewport.x,
            pinnedViewportY: viewport.y,
          };
        }),
      }));

      for (const [id, pos] of Object.entries(snappedPositions)) {
        const item = get().items.find((i) => i.id === id);
        if (item) {
          saveItemLayout(id, pos.x, pos.y, item.window, get().boardAgentId, {
            pinned: item.pinned,
            pinnedViewportX: item.pinnedViewportX,
            pinnedViewportY: item.pinnedViewportY,
          });
          saveItem(id);
        }
      }
    },

    updateItem: (id, patch) => {
      const currentItem = get().items.find((i) => i.id === id);
      set((s) => ({
        items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
      }));

      if (
        currentItem?.type === 'terminal' &&
        currentItem.agentId &&
        currentItem.ptyId &&
        typeof patch.label === 'string' &&
        patch.label !== currentItem.label
      ) {
        updatePtyMeta(currentItem.agentId, currentItem.ptyId, { label: patch.label }).catch((e) =>
          console.error('Failed to update PTY label:', e),
        );
      }

      // Only save to DB if it's not just transient pty data
      const hasDbFields = Object.keys(patch).some(
        (k) => !['ptyProcesses', 'ptyAlive', 'aiStatus'].includes(k),
      );
      if (hasDbFields) saveItem(id);
    },

    toggleSelectedItem: (id) =>
      set((s) => ({
        selectedItemIds: s.selectedItemIds.includes(id)
          ? s.selectedItemIds.filter((selectedId) => selectedId !== id)
          : [...s.selectedItemIds, id],
      })),

    setSelectedItems: (ids) => set({ selectedItemIds: [...new Set(ids)] }),

    clearSelectedItems: () => set({ selectedItemIds: [] }),

    setFocusedAnchor: (id) => set({ focusedAnchorId: id }),

    focusAnchor: (id) => {
      const z = ++topZ;
      set((s) => ({
        focusedAnchorId: id,
        draggingWindowId: null,
        items: s.items.map((i) =>
          i.id === id && i.type === 'anchor'
            ? { ...i, anchorZ: z }
            : i,
        ),
      }));
    },

    startDraggingItems: (ids) => set({ draggingItemIds: [...new Set(ids)], draggingWindowId: null }),

    stopDraggingItems: () => set({ draggingItemIds: [] }),

    startDraggingWindow: (id) => set({ draggingWindowId: id, draggingItemIds: [] }),

    stopDraggingWindow: () => set({ draggingWindowId: null }),

    toggleItemPinned: (id) => {
      const item = get().items.find((i) => i.id === id);
      if (!item) return;

      if (item.pinned) {
        const next = Number.isFinite(item.pinnedViewportX) && Number.isFinite(item.pinnedViewportY)
          ? getWorldPositionForPinned(item.pinnedViewportX!, item.pinnedViewportY!, get().panX, get().panY, get().zoom)
          : { x: item.x, y: item.y };
        set((s) => ({
          items: s.items.map((i) =>
            i.id === id
              ? {
                  ...i,
                  x: safeSnap(next.x),
                  y: safeSnap(next.y),
                  pinned: false,
                  pinnedViewportX: undefined,
                  pinnedViewportY: undefined,
                }
              : i,
          ),
        }));
        saveItem(id);
        return;
      }

      const viewport = getItemViewportPosition(item, get().panX, get().panY, get().zoom);
      set((s) => ({
        items: s.items.map((i) =>
          i.id === id
            ? {
                ...i,
                pinned: true,
                pinnedViewportX: viewport.x,
                pinnedViewportY: viewport.y,
              }
            : i,
        ),
      }));
      saveItem(id);
    },

    movePinnedItemViewport: (id, viewportX, viewportY) => {
      set((s) => ({
        items: s.items.map((i) =>
          i.id === id && i.pinned
            ? {
                ...i,
                pinnedViewportX: viewportX,
                pinnedViewportY: viewportY,
              }
            : i,
        ),
      }));
      saveItem(id);
    },

    setPan: (x, y) => {
      saveViewport(x, y, get().zoom, get().boardAgentId);
      set({ panX: x, panY: y });
    },
    setZoom: (z) => {
      const nextZoom = Math.max(0.1, Math.min(3.0, z));
      saveViewport(get().panX, get().panY, nextZoom, get().boardAgentId);
      set({ zoom: nextZoom });
    },
    setMinimapVisible: (visible) => {
      const state = get();
      saveMinimapPrefs(visible, state.minimapWidth, state.minimapHeight, state.minimapX, state.minimapY, state.boardAgentId);
      set({ minimapVisible: visible });
    },
    setMinimapSize: (width, height) => {
      const next = clampMinimapSize(width, height);
      const state = get();
      saveMinimapPrefs(state.minimapVisible, next.width, next.height, state.minimapX, state.minimapY, state.boardAgentId);
      set({ minimapWidth: next.width, minimapHeight: next.height });
    },
    setMinimapPosition: (x, y) => {
      const state = get();
      saveMinimapPrefs(state.minimapVisible, state.minimapWidth, state.minimapHeight, x, y, state.boardAgentId);
      set({ minimapX: x, minimapY: y });
    },
    setAnchorsPanelVisible: (visible) => {
      const state = get();
      saveAnchorsPanelPrefs(visible, state.anchorsPanelWidth, state.anchorsPanelHeight, state.anchorsPanelX, state.anchorsPanelY, state.boardAgentId);
      set({ anchorsPanelVisible: visible });
    },
    setAnchorsPanelSize: (width, height) => {
      const next = clampAnchorsPanelSize(width, height);
      const state = get();
      saveAnchorsPanelPrefs(state.anchorsPanelVisible, next.width, next.height, state.anchorsPanelX, state.anchorsPanelY, state.boardAgentId);
      set({ anchorsPanelWidth: next.width, anchorsPanelHeight: next.height });
    },
    setAnchorsPanelPosition: (x, y) => {
      const state = get();
      saveAnchorsPanelPrefs(state.anchorsPanelVisible, state.anchorsPanelWidth, state.anchorsPanelHeight, x, y, state.boardAgentId);
      set({ anchorsPanelX: x, anchorsPanelY: y });
    },
    cycleLayoutScope: () => {
      const state = get();
      const nextScope: LayoutScope = state.layoutScope === 'viewport'
        ? 'world'
        : state.layoutScope === 'world'
          ? 'rulers'
          : 'viewport';
      saveWorkspaceUiPrefs(nextScope, state.rulerLeft, state.rulerRight, state.rulerTop, state.rulerBottom, state.boardAgentId);
      set({ layoutScope: nextScope });
    },
    setRulerEdge: (edge, value) => {
      const state = get();
      const next = {
        rulerLeft: state.rulerLeft,
        rulerRight: state.rulerRight,
        rulerTop: state.rulerTop,
        rulerBottom: state.rulerBottom,
      };
      if (edge === 'left') next.rulerLeft = Math.max(0, value);
      if (edge === 'right') next.rulerRight = Math.max(0, value);
      if (edge === 'top') next.rulerTop = Math.max(0, value);
      if (edge === 'bottom') next.rulerBottom = Math.max(0, value);
      saveWorkspaceUiPrefs(state.layoutScope, next.rulerLeft, next.rulerRight, next.rulerTop, next.rulerBottom, state.boardAgentId);
      set(next);
    },

    saveLayoutSnapshotToServer: async (name) => {
      const trimmed = name.trim();
      if (!trimmed) {
        throw new Error('Layout name is required');
      }

      const state = get();
      const snapshot = buildCanvasLayoutSnapshot(state);
      await saveCanvasLayoutSnapshot(trimmed, snapshot, state.boardAgentId);
    },

    loadLayoutSnapshotFromServer: async (name) => {
      const trimmed = name.trim();
      if (!trimmed) {
        throw new Error('Layout name is required');
      }

      const state = get();
      const snapshot = await getCanvasLayoutSnapshot(trimmed, state.boardAgentId);
      const nextItems = state.items.map((item) => {
        const saved = snapshot.items[item.id];
        if (!saved) return item;

        return {
          ...item,
          x: saved.x,
          y: saved.y,
          pinned: saved.pinned ?? item.pinned,
          pinnedViewportX: saved.pinnedViewportX ?? item.pinnedViewportX,
          pinnedViewportY: saved.pinnedViewportY ?? item.pinnedViewportY,
          window: sanitizeSnapshotWindow(item, saved.window ?? item.window),
        };
      });

      const nextViewport = snapshot.viewport ?? {
        panX: state.panX,
        panY: state.panY,
        zoom: state.zoom,
      };

      const nextMinimap = snapshot.ui?.minimap
        ? {
            visible: snapshot.ui.minimap.visible,
            ...clampMinimapSize(snapshot.ui.minimap.width, snapshot.ui.minimap.height),
            x: snapshot.ui.minimap.x,
            y: snapshot.ui.minimap.y,
          }
        : {
            visible: state.minimapVisible,
            width: state.minimapWidth,
            height: state.minimapHeight,
            x: state.minimapX,
            y: state.minimapY,
          };

      const nextAnchorsPanel = snapshot.ui?.anchorsPanel
        ? {
            visible: snapshot.ui.anchorsPanel.visible,
            ...clampAnchorsPanelSize(snapshot.ui.anchorsPanel.width, snapshot.ui.anchorsPanel.height),
            x: snapshot.ui.anchorsPanel.x,
            y: snapshot.ui.anchorsPanel.y,
          }
        : {
            visible: state.anchorsPanelVisible,
            width: state.anchorsPanelWidth,
            height: state.anchorsPanelHeight,
            x: state.anchorsPanelX,
            y: state.anchorsPanelY,
          };

      set({
        items: nextItems,
        selectedItemIds: [],
        focusedAnchorId: null,
        draggingItemIds: [],
        draggingWindowId: null,
        panX: nextViewport.panX,
        panY: nextViewport.panY,
        zoom: nextViewport.zoom,
        minimapVisible: nextMinimap.visible,
        minimapWidth: nextMinimap.width,
        minimapHeight: nextMinimap.height,
        minimapX: nextMinimap.x,
        minimapY: nextMinimap.y,
        anchorsPanelVisible: nextAnchorsPanel.visible,
        anchorsPanelWidth: nextAnchorsPanel.width,
        anchorsPanelHeight: nextAnchorsPanel.height,
        anchorsPanelX: nextAnchorsPanel.x,
        anchorsPanelY: nextAnchorsPanel.y,
      });

      const nextLayout = Object.fromEntries(
        nextItems.map((item) => [
          item.id,
          {
            x: item.x,
            y: item.y,
            pinned: item.pinned,
            pinnedViewportX: item.pinnedViewportX,
            pinnedViewportY: item.pinnedViewportY,
            window: item.window ? { ...item.window } : undefined,
          },
        ]),
      );

      localStorage.setItem(`canvas-layout:${state.boardAgentId || 'global'}`, JSON.stringify(nextLayout));
      saveViewport(nextViewport.panX, nextViewport.panY, nextViewport.zoom, state.boardAgentId);
      saveMinimapPrefs(nextMinimap.visible, nextMinimap.width, nextMinimap.height, nextMinimap.x, nextMinimap.y, state.boardAgentId);
      saveAnchorsPanelPrefs(
        nextAnchorsPanel.visible,
        nextAnchorsPanel.width,
        nextAnchorsPanel.height,
        nextAnchorsPanel.x,
        nextAnchorsPanel.y,
        state.boardAgentId,
      );
    },

    openWindow: (id) => {
      const item = get().items.find((i) => i.id === id);
      if (!item) return;

      if (item.window?.isOpen) {
        get().focusWindow(id);
        return;
      }

      const z = ++topZ;
      const size = DEFAULT_WINDOW_SIZES[item.type];
      const openCount = get().items.filter((i) => i.window?.isOpen).length;
      const stagger = (openCount * 28) % 160;
      const reopenNearIcon = item.window && !item.window.isMinimized;
      const win: WindowState = item.window
        ? {
            ...item.window,
            isOpen: true,
            isMinimized: false,
            x: reopenNearIcon ? item.x + 112 + stagger : item.window.x,
            y: reopenNearIcon ? item.y + 24 + stagger / 2 : item.window.y,
            zIndex: z,
          }
        : {
            isOpen: true,
            isMinimized: false,
            x: item.x + 112 + stagger,
            y: item.y + 24 + stagger / 2,
            w: size.w,
            h: size.h,
            zIndex: z,
          };

      set((s) => ({
        items: s.items.map((i) => (i.id === id ? { ...i, window: win } : i)),
      }));
      const nextItem = get().items.find((i) => i.id === id);
      if (nextItem) {
        saveItemLayout(id, nextItem.x, nextItem.y, nextItem.window, get().boardAgentId, {
          pinned: nextItem.pinned,
          pinnedViewportX: nextItem.pinnedViewportX,
          pinnedViewportY: nextItem.pinnedViewportY,
        });
      }
    },

    closeWindow: (id) => {
      set((s) => ({
        items: s.items.map((i) =>
          i.id === id && i.window
            ? { ...i, window: { ...i.window, isOpen: false, isMinimized: false } }
            : i
        ),
      }));
      const item = get().items.find((i) => i.id === id);
      if (item) {
        saveItemLayout(id, item.x, item.y, item.window, get().boardAgentId, {
          pinned: item.pinned,
          pinnedViewportX: item.pinnedViewportX,
          pinnedViewportY: item.pinnedViewportY,
        });
      }
    },

    minimizeWindow: (id) => {
      set((s) => ({
        items: s.items.map((i) =>
          i.id === id && i.window
            ? { ...i, window: { ...i.window, isOpen: false, isMinimized: true } }
            : i
        ),
      }));
      const item = get().items.find((i) => i.id === id);
      if (item) {
        saveItemLayout(id, item.x, item.y, item.window, get().boardAgentId, {
          pinned: item.pinned,
          pinnedViewportX: item.pinnedViewportX,
          pinnedViewportY: item.pinnedViewportY,
        });
      }
    },

    focusWindow: (id) => {
      const z = ++topZ;
      set((s) => ({
        focusedAnchorId: null,
        draggingItemIds: [],
        items: s.items.map((i) =>
          i.id === id && i.window
            ? { ...i, window: { ...i.window, zIndex: z } }
            : i
        ),
      }));
    },

    moveWindow: (id, x, y) => {
      set((s) => ({
        items: s.items.map((i) =>
          i.id === id && i.window
            ? { ...i, window: { ...i.window, x, y } }
            : i
        ),
      }));
      const item = get().items.find((i) => i.id === id);
      if (item) {
        saveItemLayout(id, item.x, item.y, item.window, get().boardAgentId, {
          pinned: item.pinned,
          pinnedViewportX: item.pinnedViewportX,
          pinnedViewportY: item.pinnedViewportY,
        });
      }
    },

    resizeWindow: (id, w, h) => {
      set((s) => ({
        items: s.items.map((i) =>
          i.id === id && i.window
            ? { ...i, window: { ...i.window, w: Math.max(300, w), h: Math.max(200, h) } }
            : i
        ),
      }));
      const item = get().items.find((i) => i.id === id);
      if (item) {
        saveItemLayout(id, item.x, item.y, item.window, get().boardAgentId, {
          pinned: item.pinned,
          pinnedViewportX: item.pinnedViewportX,
          pinnedViewportY: item.pinnedViewportY,
        });
      }
    },

    toggleWindowLocked: (id) => {
      const state = get();
      const current = state.items.find((i) => i.id === id);
      if (!current?.window) return;

      const nowLocked = !current.window.locked;
      let nextWindow = { ...current.window, locked: nowLocked };

      if (nowLocked) {
        // Snapshot current on-screen position and size.
        const screenX = (WORLD_ORIGIN + current.window.x) * state.zoom - state.panX;
        const screenY = (WORLD_ORIGIN + current.window.y) * state.zoom - state.panY;
        nextWindow.lockedViewportX = Math.max(0, Math.round(screenX));
        nextWindow.lockedViewportY = Math.max(0, Math.round(screenY));
        nextWindow.lockedViewportW = Math.max(1, Math.round(current.window.w * state.zoom));
        nextWindow.lockedViewportH = Math.max(1, Math.round(current.window.h * state.zoom));
      } else {
        // Unlock — drop viewport snapshot; world x/y/w/h stay as-is.
        delete nextWindow.lockedViewportX;
        delete nextWindow.lockedViewportY;
        delete nextWindow.lockedViewportW;
        delete nextWindow.lockedViewportH;
      }

      set((s) => ({
        items: s.items.map((i) =>
          i.id === id ? { ...i, window: nextWindow } : i,
        ),
      }));
      const updated = get().items.find((i) => i.id === id);
      if (updated) {
        saveItemLayout(id, updated.x, updated.y, updated.window, get().boardAgentId, {
          pinned: updated.pinned,
          pinnedViewportX: updated.pinnedViewportX,
          pinnedViewportY: updated.pinnedViewportY,
        });
      }
    },

    moveLockedWindow: (id, viewportX, viewportY) => {
      set((s) => ({
        items: s.items.map((i) =>
          i.id === id && i.window?.locked
            ? {
                ...i,
                window: {
                  ...i.window,
                  lockedViewportX: Math.max(0, Math.round(viewportX)),
                  lockedViewportY: Math.max(0, Math.round(viewportY)),
                },
              }
            : i,
        ),
      }));
      const item = get().items.find((i) => i.id === id);
      if (item) {
        saveItemLayout(id, item.x, item.y, item.window, get().boardAgentId, {
          pinned: item.pinned,
          pinnedViewportX: item.pinnedViewportX,
          pinnedViewportY: item.pinnedViewportY,
        });
      }
    },

    tileWindows: (mode, scope = DEFAULT_LAYOUT_SCOPE) => {
      const state = get();
      const layoutState = {
        panX: state.panX,
        panY: state.panY,
        zoom: state.zoom,
        rulerLeft: state.rulerLeft,
        rulerRight: state.rulerRight,
        rulerTop: state.rulerTop,
        rulerBottom: state.rulerBottom,
      };
      const open = state.items.filter((i) =>
        i.window?.isOpen && !i.window.locked && shouldIncludeWindow(i, scope, layoutState),
      );
      if (open.length === 0) return;

      const GAP = 16;
      const layoutBounds = getLayoutBounds(scope, layoutState);

      let positions: { id: string; x: number; y: number; w: number; h: number }[];

      if (mode === 'columns' || (mode === 'grid' && open.length <= 3)) {
        const colW = (layoutBounds.w - GAP * (open.length + 1)) / open.length;
        positions = open.map((item, i) => ({
          id: item.id,
          x: layoutBounds.x + GAP + i * (colW + GAP),
          y: layoutBounds.y + GAP,
          w: colW,
          h: layoutBounds.h - GAP * 2,
        }));
      } else if (mode === 'rows') {
        const rowH = (layoutBounds.h - GAP * (open.length + 1)) / open.length;
        positions = open.map((item, i) => ({
          id: item.id,
          x: layoutBounds.x + GAP,
          y: layoutBounds.y + GAP + i * (rowH + GAP),
          w: layoutBounds.w - GAP * 2,
          h: rowH,
        }));
      } else {
        const cols = Math.ceil(Math.sqrt(open.length));
        const rows = Math.ceil(open.length / cols);
        const cellW = (layoutBounds.w - GAP * (cols + 1)) / cols;
        const cellH = (layoutBounds.h - GAP * (rows + 1)) / rows;
        positions = open.map((item, i) => ({
          id: item.id,
          x: layoutBounds.x + GAP + (i % cols) * (cellW + GAP),
          y: layoutBounds.y + GAP + Math.floor(i / cols) * (cellH + GAP),
          w: cellW,
          h: cellH,
        }));
      }

      let z = topZ;
      set((s) => ({
        items: s.items.map((item) => {
          const pos = positions.find((p) => p.id === item.id);
          if (!pos || !item.window) return item;
          return {
            ...item,
            window: {
              ...item.window,
              x: pos.x,
              y: pos.y,
              w: Math.max(300, pos.w),
              h: Math.max(200, pos.h),
              zIndex: ++z,
            },
          };
        }),
      }));
      topZ = z;
      for (const item of get().items) {
        if (item.window?.isOpen) {
          saveItemLayout(item.id, item.x, item.y, item.window, get().boardAgentId, {
            pinned: item.pinned,
            pinnedViewportX: item.pinnedViewportX,
            pinnedViewportY: item.pinnedViewportY,
          });
        }
      }
    },

    fitAllWindows: (scope = DEFAULT_LAYOUT_SCOPE) => {
      const state = get();
      const layoutState = {
        panX: state.panX,
        panY: state.panY,
        zoom: state.zoom,
        rulerLeft: state.rulerLeft,
        rulerRight: state.rulerRight,
        rulerTop: state.rulerTop,
        rulerBottom: state.rulerBottom,
      };
      const targetItems = state.items.filter((item) =>
        !item.window?.locked && shouldIncludeItemInScope(item, scope, layoutState),
      );
      if (targetItems.length === 0) return;
      targetItems.forEach((item) => {
        if (!item.window?.isOpen) {
          get().openWindow(item.id);
        }
      });
      get().tileWindows('grid', scope);
    },

    minimizeAllWindows: (scope = DEFAULT_LAYOUT_SCOPE) => {
      const state = get();
      const layoutState = {
        panX: state.panX,
        panY: state.panY,
        zoom: state.zoom,
        rulerLeft: state.rulerLeft,
        rulerRight: state.rulerRight,
        rulerTop: state.rulerTop,
        rulerBottom: state.rulerBottom,
      };
      const targetItems = state.items.filter((item) =>
        item.window && !item.window.locked && shouldIncludeWindow(item, scope, layoutState),
      );
      const targetIds = new Set(targetItems.map((item) => item.id));
      const hasOpenWindows = targetItems.some((item) => item.window?.isOpen);

      set((s) => ({
        items: s.items.map((item) =>
          targetIds.has(item.id) && item.window
            ? {
                ...item,
                window: hasOpenWindows
                  ? { ...item.window, isOpen: false, isMinimized: true }
                  : item.window.isMinimized
                    ? { ...item.window, isOpen: true, isMinimized: false }
                    : item.window,
              }
            : item,
        ),
      }));

      for (const item of get().items) {
        if (targetIds.has(item.id)) {
          saveItemLayout(item.id, item.x, item.y, item.window, get().boardAgentId, {
            pinned: item.pinned,
            pinnedViewportX: item.pinnedViewportX,
            pinnedViewportY: item.pinnedViewportY,
          });
        }
      }
    },

    closeAllWindows: (scope = DEFAULT_LAYOUT_SCOPE) => {
      const state = get();
      const layoutState = {
        panX: state.panX,
        panY: state.panY,
        zoom: state.zoom,
        rulerLeft: state.rulerLeft,
        rulerRight: state.rulerRight,
        rulerTop: state.rulerTop,
        rulerBottom: state.rulerBottom,
      };
      const targetIds = new Set(
        state.items
          .filter((item) => item.window && !item.window.locked && shouldIncludeWindow(item, scope, layoutState))
          .map((item) => item.id),
      );

      set((s) => ({
        items: s.items.map((item) =>
          targetIds.has(item.id) && item.window
            ? { ...item, window: { ...item.window, isOpen: false, isMinimized: false } }
            : item,
        ),
      }));

      for (const item of get().items) {
        if (targetIds.has(item.id)) {
          saveItemLayout(item.id, item.x, item.y, item.window, get().boardAgentId, {
            pinned: item.pinned,
            pinnedViewportX: item.pinnedViewportX,
            pinnedViewportY: item.pinnedViewportY,
          });
        }
      }
    },
  }),
);

// Cache is saved explicitly in loadItems and syncTerminals — no blind subscribe.
