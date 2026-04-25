export type CanvasItemType = 'terminal' | 'filebrowser' | 'notes' | 'anchor';

/**
 * Desktop render mode. Mobile always renders the icon-grid + tab manager;
 * this only affects the desktop path:
 *   - 'canvas' (default): existing pan/zoom canvas with floating windows.
 *   - 'ide':     VSCode-style sidebar list + tabbed main pane.
 */
export type ViewMode = 'canvas' | 'ide';

/** Sort modes for the IDE-view sidebar. */
export type IdeSortMode = 'type' | 'name' | 'recent' | 'status';

/**
 * Layout for a multi-tab group in IDE-view's main pane.
 *  - single: just the focused tab fills the pane (default).
 *  - v2 / h2: two-up vertical/horizontal split (left|right or top/bottom).
 *  - v3 / h3: three-up split.
 *  - grid: 2x2 (extras after 4 stack into the last cell).
 */
export type IdeGroupLayout = 'single' | 'v2' | 'h2' | 'v3' | 'h3' | 'grid';

/**
 * Tile sizes for a group layout.
 *  - For `v2`/`v3` (column splits) and `h2`/`h3` (row splits) `outer` is the
 *    flat fractional widths/heights of each cell; `inner` is unused.
 *  - For `grid`, `outer` is the per-row heights (top→bottom). `inner[r]` is
 *    the column widths of cells in row r — so a 5-cell grid becomes
 *    `outer.length = 3`, `inner = [[a,b],[c,d],[1]]`. Each inner divider
 *    only resizes tiles inside its own row.
 */
export interface IdeGroupSizes {
  outer: number[];
  inner?: number[][];
}

/**
 * A group is a tabbed/tiled container of canvas items, used in IDE view only.
 * Membership is by reference — items still exist top-level. Removing from
 * group does not kill the session.
 */
export interface IdeGroup {
  /** Always prefixed `group:` so it can share id-space with item ids. */
  id: string;
  name: string;
  members: string[];      // canvas item ids
  layout: IdeGroupLayout;
  sizes: IdeGroupSizes;
}

export interface WindowState {
  isOpen: boolean;
  isMinimized: boolean;
  locked?: boolean;
  /**
   * When `locked` is true, these hold the viewport (screen-pixel) offset
   * relative to the canvas root, plus the on-screen width/height snapshotted
   * at lock time. The window is rendered viewport-fixed (ignores pan/zoom).
   * When unlocked, these are cleared and x/y/w/h (world coords) take over.
   */
  lockedViewportX?: number;
  lockedViewportY?: number;
  lockedViewportW?: number;
  lockedViewportH?: number;
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
}

export interface CanvasItem {
  id: string;
  type: CanvasItemType;
  x: number;
  y: number;
  label: string;
  anchorZ?: number;
  pinned?: boolean;
  pinnedViewportX?: number;
  pinnedViewportY?: number;
  /** Window state when opened */
  window?: WindowState;
  /** For terminal items */
  ptyId?: string;
  agentId?: string;
  /** For notes items */
  noteContent?: string;
  /** For filebrowser items */
  currentPath?: string;
  /** Live process info from PTY state */
  ptyProcesses?: ProcessInfo[];
  /** Whether the PTY session is alive */
  ptyAlive?: boolean;
  /** AI status from Claude Code hooks: "working", "idle", "tool:Bash", etc. */
  aiStatus?: string;
}

export interface ProcessInfo {
  pid: number;
  cmd: string;
  args: string;
}

export interface PtySession {
  id: string;
  name: string;
  project_path: string;
  project_name?: string;
  last_cwd?: string;
  created_at: string;
  clients: number;
  alive: boolean;
  type: 'bash' | 'claude';
  locked: boolean;
  label: string;
  claude_session_id?: string;
  processes?: ProcessInfo[];
  ai_status?: string;
}

export interface Agent {
  id: string;
  name: string;
  ip: string;
  is_local: boolean;
  created_at: string;
  pty_info?: Record<string, unknown> | null;
}

export interface FsEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  mod_time: number;
  mode: string;
}

export interface FsListResult {
  path: string;
  parent: string;
  files: FsEntry[];
}
