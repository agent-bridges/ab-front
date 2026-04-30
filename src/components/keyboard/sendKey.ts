import { getCache } from '../terminal/TerminalCache';

/**
 * Resolves the currently-active PTY (set by TerminalView on focus) and writes
 * raw bytes to its WebSocket connection. Same channel xterm uses internally,
 * so the receiving session sees these as keystrokes.
 *
 * Modifier keys (Ctrl/Alt/Shift) are sticky per call: caller toggles via
 * setCtrl etc., next non-modifier key is transformed accordingly. Sticky
 * state is owned by the caller (the FloatingKeyboard component).
 */

const KEY_MAP: Record<string, string> = {
  Tab: '\t',
  Enter: '\r',
  Escape: '\x1b',
  Delete: '\x1b[3~',
  Backspace: '\x7f',
  ArrowUp: '\x1b[A',
  ArrowDown: '\x1b[B',
  ArrowLeft: '\x1b[D',
  ArrowRight: '\x1b[C',
  Home: '\x1b[H',
  End: '\x1b[F',
  PageUp: '\x1b[5~',
  PageDown: '\x1b[6~',
};

function activeConnection(activePtyId: string | null) {
  if (!activePtyId) return null;
  return getCache().get(activePtyId)?.connection ?? null;
}

export interface ApplyKeyOpts {
  ctrlPressed: boolean;
  altPressed: boolean;
  /** Shift is mostly handled by the OS keyboard; we only translate when the
   *  caller passes a single uppercase letter. Modifiers passed here are the
   *  sticky-state values; the floating-keyboard component flips them off
   *  after a single non-modifier key is sent. */
  shiftPressed: boolean;
}

/**
 * Translates a "key name" (e.g. 'ArrowUp', 'Tab', 'a') with current modifier
 * state into the bytes a terminal expects, and writes them. Returns true iff
 * something was sent.
 */
export function applyKey(activePtyId: string | null, key: string, opts: ApplyKeyOpts): boolean {
  const conn = activeConnection(activePtyId);
  if (!conn) return false;

  let data = KEY_MAP[key] ?? key;

  // Ctrl + letter → control char (0x01..0x1A)
  if (opts.ctrlPressed && data.length === 1) {
    const code = data.toUpperCase().charCodeAt(0);
    if (code >= 0x40 && code <= 0x5F) {
      data = String.fromCharCode(code - 0x40);
    }
  }

  // Alt → ESC prefix
  if (opts.altPressed) {
    data = '\x1b' + data;
  }

  // Shift only meaningful for single ASCII letter; uppercase it.
  if (opts.shiftPressed && data.length === 1 && /[a-z]/.test(data)) {
    data = data.toUpperCase();
  }

  conn.sendInput(data);
  return true;
}

/**
 * Scroll actions delegated to the active terminal's xterm instance.
 * No PTY round-trip; purely client-side scrollback navigation.
 */
export function scrollActiveTerminal(activePtyId: string | null, action: 'top' | 'bottom' | 'pageUp' | 'pageDown'): boolean {
  if (!activePtyId) return false;
  const cached = getCache().get(activePtyId);
  if (!cached) return false;
  switch (action) {
    case 'top':      cached.term.scrollToTop();    break;
    case 'bottom':   cached.term.scrollToBottom(); break;
    case 'pageUp':   cached.term.scrollPages(-1);  break;
    case 'pageDown': cached.term.scrollPages(1);   break;
  }
  return true;
}
