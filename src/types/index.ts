export type CanvasItemType = 'terminal' | 'filebrowser' | 'notes' | 'anchor';

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
