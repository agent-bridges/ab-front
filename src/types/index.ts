export type BoardItemType = 'filebrowser' | 'notes' | 'tunnels';

/** Sort modes for the workspace sidebar. */
export type IdeSortMode = 'type' | 'name' | 'recent' | 'status';

/**
 * Layout for a multi-entry group in the workspace's main pane.
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
 * A group is a tabbed/tiled container of direct workspace entries.
 * Membership uses stable workspace entry keys. Removing the group does not
 * kill a session or delete a board-backed resource.
 */
export interface IdeGroup {
  /** Always prefixed `group:` so it can share id-space with workspace entry keys. */
  id: string;
  name: string;
  members: string[];      // workspace entry keys
  layout: IdeGroupLayout;
  sizes: IdeGroupSizes;
}

export interface BoardItem {
  id: string;
  type: BoardItemType;
  label: string;
  agentId?: string;
  noteContent?: string;
  currentPath?: string;
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
  last_cwd?: string;
  created_at: string;
  clients: number;
  alive: boolean;
  type: 'bash' | 'claude';
  locked: boolean;
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
