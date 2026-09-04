import { create } from 'zustand';
import { deleteBoardItem, fetchBoardItems, saveBoardItem } from '../api/board';
import type { BoardItem, BoardItemType, IdeGroup, IdeGroupLayout, IdeGroupSizes, IdeSortMode } from '../types';

interface WorkspacePrefs {
  sort: IdeSortMode;
  sidebarWidth: number;
  openTabIds: string[];
  focusedItemId: string | null;
  groups: IdeGroup[];
}

const DEFAULT_PREFS: WorkspacePrefs = { sort: 'type', sidebarWidth: 260, openTabIds: [], focusedItemId: null, groups: [] };
const prefsKey = (agentId: string) => `ab:workspace:${agentId}`;

function loadPrefs(agentId: string): WorkspacePrefs {
  try {
    const parsed = JSON.parse(localStorage.getItem(prefsKey(agentId)) || '{}');
    return {
      sort: ['type', 'name', 'recent', 'status'].includes(parsed.sort) ? parsed.sort : DEFAULT_PREFS.sort,
      sidebarWidth: typeof parsed.sidebarWidth === 'number' ? parsed.sidebarWidth : DEFAULT_PREFS.sidebarWidth,
      openTabIds: Array.isArray(parsed.openTabIds) ? parsed.openTabIds.filter((id: unknown) => typeof id === 'string') : [],
      focusedItemId: typeof parsed.focusedItemId === 'string' ? parsed.focusedItemId : null,
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
    };
  } catch { return { ...DEFAULT_PREFS }; }
}

function savePrefs(agentId: string | null, prefs: WorkspacePrefs) {
  if (agentId) localStorage.setItem(prefsKey(agentId), JSON.stringify(prefs));
}

function defaultSizes(layout: IdeGroupLayout, count: number): IdeGroupSizes {
  if (count <= 1 || layout === 'single') return { outer: count ? [1] : [] };
  if (layout === 'grid') {
    const rows = Math.ceil(count / 2);
    return { outer: new Array(rows).fill(1 / rows), inner: new Array(rows).fill(null).map((_, row) => {
      const cells = Math.min(2, count - row * 2);
      return new Array(cells).fill(1 / cells);
    }) };
  }
  return { outer: new Array(count).fill(1 / count) };
}

interface WorkspaceState extends WorkspacePrefs {
  agentId: string | null;
  boardItems: BoardItem[];
  loaded: boolean;
  loadError: string | null;
  load: (agentId: string | null) => Promise<void>;
  addBoardItem: (type: BoardItemType) => Promise<string | null>;
  updateBoardItem: (id: string, patch: Partial<BoardItem>) => void;
  removeBoardItem: (id: string) => Promise<void>;
  setSort: (sort: IdeSortMode) => void;
  setSidebarWidth: (width: number) => void;
  openTab: (id: string) => void;
  closeTab: (id: string) => void;
  focusTab: (id: string | null) => void;
  createGroup: (members: string[]) => string;
  deleteGroup: (id: string) => void;
  renameGroup: (id: string, name: string) => void;
  removeGroupMember: (id: string, member: string) => void;
  setGroupLayout: (id: string, layout: IdeGroupLayout) => void;
}

let nextId = Date.now();

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  ...DEFAULT_PREFS,
  agentId: null,
  boardItems: [],
  loaded: false,
  loadError: null,
  load: async (agentId) => {
    if (!agentId) { set({ agentId: null, boardItems: [], loaded: true, loadError: null, ...DEFAULT_PREFS }); return; }
    const prefs = loadPrefs(agentId);
    // A board_items_changed notification is a background refresh, not a
    // navigation. Keep the current entries mounted while their replacement is
    // fetched; clearing them here makes active Files/Notes panes flash and
    // resets their local UI state on every daemon notification.
    if (get().agentId === agentId) {
      set({ loaded: false, loadError: null });
    } else {
      set({ agentId, boardItems: [], loaded: false, loadError: null, ...prefs });
    }
    try {
      const boardItems = await fetchBoardItems(agentId);
      if (get().agentId === agentId) set({ boardItems, loaded: true, loadError: null });
    } catch (error) {
      console.error('Failed to load workspace resources:', error);
      if (get().agentId === agentId) set({
        boardItems: [],
        loaded: false,
        loadError: error instanceof Error ? error.message : 'Workspace resource loading failed',
      });
    }
  },
  addBoardItem: async (type) => {
    const agentId = get().agentId;
    if (!agentId) return null;
    const existing = type === 'tunnels' ? get().boardItems.find((item) => item.type === type) : undefined;
    if (existing) { get().openTab(`board:${existing.id}`); return existing.id; }
    const item: BoardItem = {
      id: `item-${nextId++}`,
      type,
      label: type === 'filebrowser' ? 'Files' : type === 'notes' ? 'Notes' : 'Tunnels',
      agentId,
      ...(type === 'filebrowser' ? { currentPath: '~' } : {}),
    };
    set((state) => ({ boardItems: [...state.boardItems, item] }));
    try { await saveBoardItem(item); } catch (error) {
      set((state) => ({ boardItems: state.boardItems.filter((candidate) => candidate.id !== item.id) }));
      throw error;
    }
    get().openTab(`board:${item.id}`);
    return item.id;
  },
  updateBoardItem: (id, patch) => {
    const current = get().boardItems.find((candidate) => candidate.id === id);
    if (!current) return;
    // FileBrowser resolves '~' to an absolute path on mount. Once that path is
    // already stored, repeated loads must not write the identical board item:
    // every write produces board_items_changed and used to form a refresh loop.
    const changed = Object.entries(patch).some(([key, value]) => current[key as keyof BoardItem] !== value);
    if (!changed) return;
    const next = { ...current, ...patch };
    set((state) => ({ boardItems: state.boardItems.map((item) => item.id === id ? next : item) }));
    void saveBoardItem(next).catch((error) => console.error('Failed to save workspace resource:', error));
  },
  removeBoardItem: async (id) => {
    await deleteBoardItem(id, get().agentId);
    set((state) => ({ boardItems: state.boardItems.filter((item) => item.id !== id) }));
    get().closeTab(`board:${id}`);
  },
  setSort: (sort) => { set({ sort }); const s = get(); savePrefs(s.agentId, s); },
  setSidebarWidth: (sidebarWidth) => { set({ sidebarWidth: Math.max(200, Math.min(480, sidebarWidth)) }); const s = get(); savePrefs(s.agentId, s); },
  openTab: (id) => { set((s) => ({ openTabIds: s.openTabIds.includes(id) ? s.openTabIds : [...s.openTabIds, id], focusedItemId: id })); const s = get(); savePrefs(s.agentId, s); },
  closeTab: (id) => { set((s) => { const open = s.openTabIds.filter((key) => key !== id); return { openTabIds: open, focusedItemId: s.focusedItemId === id ? open[open.length - 1] || null : s.focusedItemId }; }); const s = get(); savePrefs(s.agentId, s); },
  focusTab: (focusedItemId) => { set({ focusedItemId }); const s = get(); savePrefs(s.agentId, s); },
  createGroup: (members) => {
    const id = `group:${Date.now()}`;
    const layout: IdeGroupLayout = members.length > 3 ? 'grid' : members.length === 3 ? 'v3' : 'v2';
    const group: IdeGroup = { id, name: 'Workspace group', members: [...new Set(members)], layout, sizes: defaultSizes(layout, members.length) };
    set((s) => ({ groups: [...s.groups, group] })); const s = get(); savePrefs(s.agentId, s); get().openTab(id); return id;
  },
  deleteGroup: (id) => { set((s) => ({ groups: s.groups.filter((g) => g.id !== id) })); get().closeTab(id); const s = get(); savePrefs(s.agentId, s); },
  renameGroup: (id, name) => { set((s) => ({ groups: s.groups.map((g) => g.id === id ? { ...g, name } : g) })); const s = get(); savePrefs(s.agentId, s); },
  removeGroupMember: (id, member) => { set((s) => ({ groups: s.groups.map((g) => g.id === id ? { ...g, members: g.members.filter((key) => key !== member), sizes: defaultSizes(g.layout, Math.max(0, g.members.length - 1)) } : g) })); const s = get(); savePrefs(s.agentId, s); },
  setGroupLayout: (id, layout) => { set((s) => ({ groups: s.groups.map((g) => g.id === id ? { ...g, layout, sizes: defaultSizes(layout, g.members.length) } : g) })); const s = get(); savePrefs(s.agentId, s); },
}));
