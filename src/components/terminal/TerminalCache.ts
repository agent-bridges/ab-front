import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { PtyConnection } from '../../api/websocket';

export interface CachedTerminal {
  term: Terminal;
  fitAddon: FitAddon;
  container: HTMLDivElement;
  connection: PtyConnection;
  ptyId: string;
  lastUsed: number;
  stickyToBottom: boolean;
  scrollbackTotalChunks: number;
  scrollbackReturnedChunks: number;
  scrollbackLoading: boolean;
  scrollbackWritePending: boolean;
  scrollbackInfoReceived: boolean;
  restoreDistanceFromBottom: number | null;
  forceBottomAfterReplay: boolean;
  /** Explicit refresh follows every delayed Codex redraw chunk for this window. */
  forceBottomUntil: number;
  onFilePath?: (path: string) => void;
}

const CACHE_KEY = '__ab2_terminal_cache__';
const MAX_CACHED = 100;

export function getCache(): Map<string, CachedTerminal> {
  if (!(globalThis as any)[CACHE_KEY]) {
    (globalThis as any)[CACHE_KEY] = new Map<string, CachedTerminal>();
  }
  return (globalThis as any)[CACHE_KEY];
}

export function evictOldest(keepId?: string) {
  const cache = getCache();
  while (cache.size > MAX_CACHED) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, val] of cache) {
      if (key === keepId) continue;
      if (val.lastUsed < oldestTime) {
        oldestTime = val.lastUsed;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      const cached = cache.get(oldestKey)!;
      cached.connection.destroy();
      cached.term.dispose();
      cached.container.remove();
      cache.delete(oldestKey);
    } else break;
  }
}

export function forceRefresh(ptyId: string) {
  const cache = getCache();
  const cached = cache.get(ptyId);
  if (!cached) return;
  // Refresh is an explicit request to return to live output, not a passive
  // resize while the user is reading history. Pin both the current viewport
  // and the upcoming clear/replay to the tail.
  cached.stickyToBottom = true;
  cached.forceBottomAfterReplay = true;
  cached.forceBottomUntil = Date.now() + 5_000;
  cached.restoreDistanceFromBottom = null;
  cached.term.scrollToBottom();
  cached.fitAddon.fit();
  const { rows, cols } = cached.term;
  // Fake resize to trigger server scrollback re-send, then restore
  cached.connection.sendResize(rows, cols - 1);
  setTimeout(() => {
    cached.connection.sendResize(rows, cols);
    requestAnimationFrame(() => cached.term.scrollToBottom());
  }, 100);
  // A fullscreen TUI redraw can be delayed well beyond the resize frame,
  // especially over a relay. Re-pin after the common redraw/replay phases.
  for (const delay of [350, 900, 1_800]) {
    setTimeout(() => {
      if (getCache().get(ptyId) !== cached) return;
      requestAnimationFrame(() => {
        cached.term.scrollToBottom();
        cached.stickyToBottom = true;
      });
    }, delay);
  }
}

export function destroyAll() {
  const cache = getCache();
  for (const cached of cache.values()) {
    cached.connection.destroy();
    cached.term.dispose();
    cached.container.remove();
  }
  cache.clear();
}
