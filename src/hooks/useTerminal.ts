import { useEffect, useRef, useCallback } from 'react';
import type { CanvasItem } from '../types';
import { useAgentStore } from '../stores/agentStore';
import { useCanvasStore } from '../stores/canvasStore';
import { createPty } from '../api/pty';
import { authFetch } from '../api/client';
import { PtyConnection } from '../api/websocket';
import { getCache, evictOldest } from '../components/terminal/TerminalCache';
import type { CachedTerminal } from '../components/terminal/TerminalCache';

const TERMINAL_OPTIONS = {
  cursorBlink: true,
  cursorStyle: 'block' as const,
  cursorInactiveStyle: 'outline' as const,
  fontFamily: '"JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
  fontSize: 13,
  lineHeight: 1.2,
  scrollback: 10000,
  scrollSensitivity: 3,
  theme: {
    background: '#06060a',
    foreground: '#e4e4ef',
    cursor: '#d4a574',
    cursorAccent: '#06060a',
    selectionBackground: 'rgba(212, 165, 116, 0.3)',
    black: '#1a1a24',
    red: '#e06c75',
    green: '#7ec699',
    yellow: '#e5c07b',
    blue: '#61afef',
    magenta: '#c678dd',
    cyan: '#56b6c2',
    white: '#e4e4ef',
    brightBlack: '#5c5c6e',
    brightRed: '#e88993',
    brightGreen: '#98d4af',
    brightYellow: '#ecd08f',
    brightBlue: '#7fc1f5',
    brightMagenta: '#d498e5',
    brightCyan: '#75c7d0',
    brightWhite: '#ffffff',
  },
  allowProposedApi: true,
};

function isNearBottom(term: any) {
  try {
    const buffer = term.buffer.active;
    return buffer.baseY - buffer.viewportY <= 1;
  } catch {
    return true;
  }
}

function scrollToBottomIfNeeded(term: any, shouldStick: boolean) {
  if (!shouldStick) return;
  try {
    term.scrollToBottom();
  } catch {}
}

function shouldStickToBottom(cached: CachedTerminal | null, stickyUntil: number) {
  if (!cached) return Date.now() < stickyUntil;
  return cached.stickyToBottom || Date.now() < stickyUntil;
}

function stripTerminalRecoveryNoise(data: string) {
  return data
    .replace(/\x1bP.*?\x1b\\/gs, '')
    .replace(/\x1b\[\?[\d;]*\$y/g, '')
    .replace(/\?[\d;]*\$y/g, '');
}

const FULLSCREEN_TUI_COMMANDS = new Set([
  'vi',
  'vim',
  'nvim',
  'nano',
  'less',
  'more',
  'man',
  'htop',
  'top',
  'btop',
  'tig',
  'lazygit',
  'watch',
]);

function hasFullscreenProcess(item: CanvasItem) {
  return Boolean(item.ptyProcesses?.some((proc) => FULLSCREEN_TUI_COMMANDS.has(proc.cmd)));
}

export function useTerminal(
  item: CanvasItem,
  wrapperRef: React.RefObject<HTMLDivElement | null>,
  setError: (err: string | null) => void,
) {
  const activeCached = useRef<CachedTerminal | null>(null);
  const resizeObserver = useRef<ResizeObserver | null>(null);
  const lastSize = useRef({ rows: 0, cols: 0 });
  const didSetup = useRef(false);
  const stickyBottomUntil = useRef(0);
  const resizeFrame = useRef<number | null>(null);
  const resizeDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const agentId = useAgentStore((s) => s.currentAgentId);
  const needsFullscreenRedraw = hasFullscreenProcess(item);

  const setupTerminal = useCallback(async () => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !agentId) return;
    if (didSetup.current) return;
    didSetup.current = true;

    setError(null);
    const cache = getCache();
    let ptyId = item.ptyId;

    // If no ptyId yet, create a new PTY
    if (!ptyId) {
      const result = await createPty({ agentId, shellOnly: true });
      if (!result.ok || !result.session_id) {
        setError(result.error || 'PTY server unavailable');
        return;
      }
      ptyId = result.session_id;
      useCanvasStore.getState().updateItem(item.id, { ptyId, agentId });
    }

    // Check cache
    if (cache.has(ptyId)) {
      const cached = cache.get(ptyId)!;
      cached.lastUsed = Date.now();
      activeCached.current = cached;

      if (!wrapper.contains(cached.container)) {
        wrapper.appendChild(cached.container);
      }
      cached.container.style.display = 'block';
      const stickToBottom = shouldStickToBottom(cached, stickyBottomUntil.current);
      cached.fitAddon.fit();
      scrollToBottomIfNeeded(cached.term, stickToBottom);
      cached.term.focus();

      if (cached.connection.status !== 'connected') {
        cached.connection.attach(cached.term.rows, cached.term.cols, true);
      }
      return;
    }

    // Create new terminal
    const { Terminal } = await import('@xterm/xterm');
    const { FitAddon } = await import('@xterm/addon-fit');
    const { WebLinksAddon } = await import('@xterm/addon-web-links');
    const { Unicode11Addon } = await import('@xterm/addon-unicode11');
    await import('@xterm/xterm/css/xterm.css');

    if (!wrapperRef.current) return;

    const container = document.createElement('div');
    container.style.cssText = 'position: absolute; inset: 0;';
    wrapper.appendChild(container);

    const term = new Terminal(TERMINAL_OPTIONS);
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());
    const unicode11 = new Unicode11Addon();
    term.loadAddon(unicode11);
    term.unicode.activeVersion = '11';
    term.open(container);

    const connection = new PtyConnection(agentId, ptyId);

    connection.setOnData((data) => {
      const filtered = stripTerminalRecoveryNoise(data).replace(/\x7f/g, '');
      if (!filtered) return;

      const stickToBottom = shouldStickToBottom(activeCached.current, stickyBottomUntil.current);
      term.write(filtered, () => {
        scrollToBottomIfNeeded(term, stickToBottom);
      });
    });

    connection.setOnClear(() => {
      const stickToBottom = shouldStickToBottom(activeCached.current, stickyBottomUntil.current);
      term.clear();
      term.reset();
      scrollToBottomIfNeeded(term, stickToBottom);
    });

    connection.setOnSessionEnded(() => {
      useCanvasStore.getState().updateItem(item.id, {
        ptyAlive: false,
        ptyProcesses: [],
        aiStatus: '',
      });
      setError('Terminal session ended. Reopen it or start a new one.');
    });

    connection.setOnReady(() => {
      if (!needsFullscreenRedraw) return;
      const rows = term.rows;
      const cols = term.cols;
      const nudgedCols = Math.max(2, cols - 1);
      setTimeout(() => {
        connection.sendResize(rows, nudgedCols);
        setTimeout(() => {
          connection.sendResize(rows, cols);
        }, 75);
      }, 40);
    });

    term.onData((data) => {
      const filtered = data
        .replace(/\x1b\[\d*;\d*R/g, '')
        .replace(/\x1b\[\?[\d;]*c/g, '')
        .replace(/\x1b\[>[\d;]*c/g, '')
        .replace(/\x1b\]\d+;[^\x07\x1b]*(?:\x07|\x1b\\)/g, '');
      if (filtered) {
        const stickToBottom = shouldStickToBottom(activeCached.current, stickyBottomUntil.current);
        if (stickToBottom) {
          stickyBottomUntil.current = Date.now() + (/(?:\r|\n)/.test(filtered) ? 1200 : 300);
        }
        connection.sendInput(filtered);
        requestAnimationFrame(() => {
          scrollToBottomIfNeeded(term, shouldStickToBottom(activeCached.current, stickyBottomUntil.current));
        });
      }
    });

    const cached: CachedTerminal = {
      term,
      fitAddon,
      container,
      connection,
      ptyId,
      lastUsed: Date.now(),
      stickyToBottom: true,
    };

    cache.set(ptyId, cached);
    evictOldest(ptyId);
    activeCached.current = cached;

    term.onScroll(() => {
      cached.stickyToBottom = isNearBottom(term);
      if (cached.stickyToBottom) {
        stickyBottomUntil.current = 0;
      }
    });

    requestAnimationFrame(() => {
      fitAddon.fit();
      connection.attach(term.rows, term.cols, true);
      term.focus();
      scrollToBottomIfNeeded(term, shouldStickToBottom(cached, stickyBottomUntil.current));
      lastSize.current = { rows: term.rows, cols: term.cols };
    });
  }, [agentId, item.id, item.ptyId, needsFullscreenRedraw, wrapperRef, setError]);

  const flushResize = useCallback(() => {
    const cached = activeCached.current;
    if (!cached) return;

    const stickToBottom = shouldStickToBottom(cached, stickyBottomUntil.current);
    cached.fitAddon.fit();
    scrollToBottomIfNeeded(cached.term, stickToBottom);

    const { rows, cols } = cached.term;
    if (rows !== lastSize.current.rows || cols !== lastSize.current.cols) {
      lastSize.current = { rows, cols };
      cached.connection.sendResize(rows, cols);
      requestAnimationFrame(() => {
        scrollToBottomIfNeeded(cached.term, stickToBottom);
      });
    }
  }, []);

  const scheduleResize = useCallback(() => {
    if (resizeFrame.current !== null) {
      cancelAnimationFrame(resizeFrame.current);
    }
    resizeFrame.current = requestAnimationFrame(() => {
      resizeFrame.current = null;
      const cached = activeCached.current;
      if (!cached) return;
      const stickToBottom = shouldStickToBottom(cached, stickyBottomUntil.current);
      cached.fitAddon.fit();
      scrollToBottomIfNeeded(cached.term, stickToBottom);
    });

    if (resizeDebounce.current) {
      clearTimeout(resizeDebounce.current);
    }
    resizeDebounce.current = setTimeout(() => {
      resizeDebounce.current = null;
      flushResize();
    }, 120);
  }, [flushResize]);

  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    if (!e.clipboardData?.items) return;

    const wrapper = wrapperRef.current;
    const cached = activeCached.current;
    const effectiveAgentId = item.agentId || agentId;
    if (!wrapper || !cached || !effectiveAgentId) return;

    const activeEl = document.activeElement;
    if (!activeEl || !wrapper.contains(activeEl)) return;

    for (const clipItem of e.clipboardData.items) {
      if (!clipItem.type.startsWith('image/')) continue;

      const file = clipItem.getAsFile();
      if (!file) return;

      e.preventDefault();
      e.stopPropagation();

      const reader = new FileReader();
      reader.onload = async () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const base64 = result.split(',')[1];
        if (!base64) return;

        try {
          const resp = await authFetch(`/api/agents/${effectiveAgentId}/paste-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image_data: base64,
              mime_type: clipItem.type,
            }),
          });

          const data = await resp.json();
          if (data.ok && data.path) {
            cached.connection.sendInput(data.path + ' ');
          } else {
            console.error('Paste image failed:', data.error || data.detail || 'unknown error');
          }
        } catch (err) {
          console.error('Paste image error:', err);
        }
      };
      reader.readAsDataURL(file);
      return;
    }
  }, [agentId, item.agentId, wrapperRef]);

  useEffect(() => {
    didSetup.current = false;
    setupTerminal();

    document.addEventListener('paste', handlePaste, true);

    const wrapper = wrapperRef.current;
    if (wrapper) {
      resizeObserver.current = new ResizeObserver(() => {
        scheduleResize();
      });
      resizeObserver.current.observe(wrapper);
    }

    return () => {
      resizeObserver.current?.disconnect();
      if (resizeFrame.current !== null) {
        cancelAnimationFrame(resizeFrame.current);
        resizeFrame.current = null;
      }
      if (resizeDebounce.current) {
        clearTimeout(resizeDebounce.current);
        resizeDebounce.current = null;
      }
      document.removeEventListener('paste', handlePaste, true);
      if (activeCached.current) {
        activeCached.current.container.style.display = 'none';
      }
    };
  }, [handlePaste, scheduleResize, setupTerminal, wrapperRef]);
}
