import { useEffect, useRef, useCallback } from 'react';
import type { PtySession } from '../types';
import { authFetch } from '../api/client';
import { PtyConnection } from '../api/websocket';
import { getCache, evictOldest } from '../components/terminal/TerminalCache';
import type { CachedTerminal } from '../components/terminal/TerminalCache';
import {
  followTerminalTail,
  isTerminalAtBottom,
  nextScrollbackLimit,
  restoredViewportLine,
} from '../components/terminal/terminalViewport';
import { getTerminalFontSize } from '../components/MobileSettingsPanel';
import { createTerminalFileLinkProvider } from '../components/terminal/terminalFileLinkProvider';

const TERMINAL_OPTIONS = {
  cursorBlink: true,
  cursorStyle: 'block' as const,
  cursorInactiveStyle: 'outline' as const,
  fontFamily: '"JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
  fontSize: getTerminalFontSize(),
  lineHeight: 1.2,
  scrollback: 10000,
  scrollSensitivity: 3,
  scrollOnUserInput: true,
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

const INITIAL_SCROLLBACK_CHUNKS = 512;

function scrollToBottomIfNeeded(term: any, shouldStick: boolean) {
  try {
    followTerminalTail(term, shouldStick);
  } catch {}
}

function stripTerminalRecoveryNoise(data: string) {
  return data
    .replace(/\x1bP.*?\x1b\\/gs, '')
    .replace(/\x1b\[\?[\d;]*\$y/g, '')
    .replace(/\?[\d;]*\$y/g, '')
    // Drop Claude Code v2.1+'s cosmetic status line "sent N chars via
    // OSC 52 · check terminal clipboard settings if paste fails". It's
    // plain stdout text (not part of the OSC escape), pure noise in the
    // AB web terminal. The actual OSC 52 escape is left untouched — xterm
    // handles (or ignores) it natively, same as a normal terminal.
    .replace(/sent \d+ chars? via OSC 52[^\n\r]*/g, '');
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

function hasFullscreenProcess(session: PtySession) {
  return Boolean(session.processes?.some((proc) => FULLSCREEN_TUI_COMMANDS.has(proc.cmd)));
}

export function useTerminal(
  session: PtySession,
  agentId: string,
  wrapperRef: React.RefObject<HTMLDivElement | null>,
  setError: (err: string | null) => void,
  onFilePath?: (path: string) => void,
) {
  const activeCached = useRef<CachedTerminal | null>(null);
  const resizeObserver = useRef<ResizeObserver | null>(null);
  const lastSize = useRef({ rows: 0, cols: 0 });
  const didSetup = useRef(false);
  const resizeFrame = useRef<number | null>(null);
  const resizeDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const needsFullscreenRedraw = hasFullscreenProcess(session);

  const setupTerminal = useCallback(async () => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !agentId) return;
    if (didSetup.current) return;
    didSetup.current = true;

    setError(null);
    const cache = getCache();
    const ptyId = session.id;

    // Check cache
    if (cache.has(ptyId)) {
      const cached = cache.get(ptyId)!;
      cached.lastUsed = Date.now();
      activeCached.current = cached;
      cached.onFilePath = onFilePath;

      if (!wrapper.contains(cached.container)) {
        wrapper.appendChild(cached.container);
      }
      cached.container.style.display = 'block';
      const stickToBottom = cached.stickyToBottom;
      cached.fitAddon.fit();
      scrollToBottomIfNeeded(cached.term, stickToBottom);
      cached.term.focus();

      if (cached.connection.status !== 'connected') {
        cached.connection.attach(cached.term.rows, cached.term.cols, false, cached.scrollbackReturnedChunks || INITIAL_SCROLLBACK_CHUNKS);
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
    let cached: CachedTerminal;

    connection.setOnData((data) => {
      const filtered = stripTerminalRecoveryNoise(data).replace(/\x7f/g, '');
      if (!filtered) return;

      // An explicit refresh must follow the complete multi-chunk replay and
      // delayed Codex redraw, not only the first websocket data frame.
      const forceBottom = cached.forceBottomAfterReplay || Date.now() < (cached.forceBottomUntil || 0);
      const restoreDistance = cached.restoreDistanceFromBottom;
      const replayWrite = cached.scrollbackLoading && (forceBottom || restoreDistance !== null);
      if (replayWrite) cached.scrollbackWritePending = true;
      cached.forceBottomAfterReplay = false;
      cached.restoreDistanceFromBottom = null;

      // xterm already follows new output while its viewport is at the tail and
      // preserves the viewport while the user is reading scrollback. Calling
      // scrollToBottom from the write callback races with wheel/scrollbar
      // input on desktop and can drag the user back to the live output.
      if (forceBottom || restoreDistance !== null) {
        term.write(filtered, () => {
          if (forceBottom) {
            term.scrollToBottom();
            cached.stickyToBottom = true;
          } else if (restoreDistance !== null) {
            term.scrollToLine(restoredViewportLine(term.buffer.active.baseY, restoreDistance));
            cached.stickyToBottom = isTerminalAtBottom(term);
          }
          if (replayWrite) {
            cached.scrollbackWritePending = false;
            if (cached.scrollbackInfoReceived) cached.scrollbackLoading = false;
          }
        });
      } else {
        term.write(filtered);
      }
    });

    connection.setOnClear(() => {
      if (!cached.scrollbackLoading) {
        cached.scrollbackLoading = true;
        cached.scrollbackInfoReceived = false;
        cached.scrollbackWritePending = false;
        if (cached.stickyToBottom) cached.forceBottomAfterReplay = true;
        else cached.restoreDistanceFromBottom = term.buffer.active.baseY - term.buffer.active.viewportY;
      }
      const stickToBottom = cached.stickyToBottom;
      term.clear();
      term.reset();
      // reset() may emit a scroll event for its temporary empty buffer. That
      // event is not a user returning to the tail, so keep the prior policy.
      cached.stickyToBottom = stickToBottom;
      scrollToBottomIfNeeded(term, stickToBottom);
    });

    connection.setOnScrollbackInfo(({ totalChunks, returnedChunks }) => {
      cached.scrollbackTotalChunks = totalChunks;
      cached.scrollbackReturnedChunks = returnedChunks;
      cached.scrollbackInfoReceived = true;
      if (!cached.scrollbackWritePending) cached.scrollbackLoading = false;
      if (returnedChunks === 0 && cached.forceBottomAfterReplay) {
        cached.forceBottomAfterReplay = false;
        term.scrollToBottom();
        cached.stickyToBottom = true;
      }
    });

    connection.setOnSessionEnded(() => {
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
        connection.sendInput(filtered);
        requestAnimationFrame(() => {
          scrollToBottomIfNeeded(term, cached.stickyToBottom);
        });
      }
    });

    cached = {
      term,
      fitAddon,
      container,
      connection,
      ptyId,
      lastUsed: Date.now(),
      stickyToBottom: true,
      scrollbackTotalChunks: 0,
      scrollbackReturnedChunks: 0,
      scrollbackLoading: true,
      scrollbackWritePending: false,
      scrollbackInfoReceived: false,
      restoreDistanceFromBottom: null,
      forceBottomAfterReplay: true,
      forceBottomUntil: 0,
    };

    cache.set(ptyId, cached);
    cached.onFilePath = onFilePath;
    term.registerLinkProvider(createTerminalFileLinkProvider(term, (path) => cached.onFilePath?.(path)));
    evictOldest(ptyId);
    activeCached.current = cached;

    term.onScroll(() => {
      cached.stickyToBottom = isTerminalAtBottom(term);
      if (term.buffer.active.viewportY !== 0 || cached.scrollbackLoading) return;
      const limit = nextScrollbackLimit(cached.scrollbackReturnedChunks, cached.scrollbackTotalChunks, INITIAL_SCROLLBACK_CHUNKS);
      if (limit === null) return;
      cached.scrollbackLoading = true;
      cached.scrollbackInfoReceived = false;
      cached.scrollbackWritePending = false;
      cached.restoreDistanceFromBottom = term.buffer.active.baseY - term.buffer.active.viewportY;
      connection.requestMoreScrollback(limit);
    });

    requestAnimationFrame(() => {
      fitAddon.fit();
      connection.attach(term.rows, term.cols, false, INITIAL_SCROLLBACK_CHUNKS);
      term.focus();
      scrollToBottomIfNeeded(term, cached.stickyToBottom);
      lastSize.current = { rows: term.rows, cols: term.cols };
    });
  }, [agentId, session.id, needsFullscreenRedraw, onFilePath, wrapperRef, setError]);

  const flushResize = useCallback(() => {
    const cached = activeCached.current;
    if (!cached) return;

    const stickToBottom = cached.stickyToBottom;
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
      const stickToBottom = cached.stickyToBottom;
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
    if (!wrapper || !cached || !agentId) return;

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
          const resp = await authFetch(`/api/agents/${agentId}/paste-image`, {
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
  }, [agentId, wrapperRef]);

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

    // Listen for font size changes from settings — apply to ALL cached terminals
    const handleSettingsChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.fontSize) {
        const cache = getCache();
        for (const cached of cache.values()) {
          cached.term.options.fontSize = detail.fontSize;
          cached.fitAddon.fit();
        }
      }
    };
    window.addEventListener('ab-settings-change', handleSettingsChange);

    return () => {
      window.removeEventListener('ab-settings-change', handleSettingsChange);
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
        activeCached.current.onFilePath = undefined;
        activeCached.current.container.style.display = 'none';
      }
    };
  }, [handlePaste, scheduleResize, setupTerminal, wrapperRef]);
}
