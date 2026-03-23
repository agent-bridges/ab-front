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
  cached.fitAddon.fit();
  const { rows, cols } = cached.term;
  // Fake resize to trigger server scrollback re-send, then restore
  cached.connection.sendResize(rows, cols - 1);
  setTimeout(() => {
    cached.connection.sendResize(rows, cols);
  }, 100);
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
