import { create } from 'zustand';

/**
 * Touch-keyboard widgets. Two floating panels:
 *  - keyboard: arrow keys + Tab/Enter/Esc/Ctrl/Alt/Shift/Del → sends bytes to
 *    the currently-active terminal's PTY.
 *  - scroll:   xterm scroll-to-top / page-up / page-down / scroll-to-bottom
 *    on the active terminal.
 *
 * Both are draggable; positions persisted as percentages of viewport so they
 * survive resize/orientation. Settings live per-browser in localStorage.
 */

export interface FloatingPanelPrefs {
  visible: boolean;
  opacity: number;        // 0–100
  iconSize: number;       // px (the legacy default is 18)
  positionX: number;      // 0–100 % of viewport width
  positionY: number;      // 0–100 % of viewport height
}

export interface KeyboardButtons {
  arrowKeys: boolean;
  tab: boolean;
  enter: boolean;
  esc: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  del: boolean;
}

const DEFAULT_KEYBOARD: FloatingPanelPrefs & { buttons: KeyboardButtons } = {
  visible: false,
  opacity: 90,
  iconSize: 18,
  positionX: 50,
  positionY: 70,
  buttons: {
    arrowKeys: true,
    tab: true,
    enter: false,
    esc: true,
    ctrl: true,
    alt: false,
    shift: false,
    del: false,
  },
};

const DEFAULT_SCROLL: FloatingPanelPrefs = {
  visible: false,
  opacity: 90,
  iconSize: 16,
  positionX: 2,
  positionY: 50,
};

const KEYBOARD_KEY = 'ab-floating-keyboard';
const SCROLL_KEY = 'ab-floating-scroll';

function loadKeyboard(): typeof DEFAULT_KEYBOARD {
  try {
    const raw = localStorage.getItem(KEYBOARD_KEY);
    if (!raw) return DEFAULT_KEYBOARD;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_KEYBOARD,
      ...parsed,
      buttons: { ...DEFAULT_KEYBOARD.buttons, ...(parsed.buttons || {}) },
    };
  } catch {
    return DEFAULT_KEYBOARD;
  }
}

function loadScroll(): FloatingPanelPrefs {
  try {
    const raw = localStorage.getItem(SCROLL_KEY);
    if (!raw) return DEFAULT_SCROLL;
    return { ...DEFAULT_SCROLL, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SCROLL;
  }
}

interface KeyboardState {
  // Keyboard widget
  keyboard: typeof DEFAULT_KEYBOARD;
  setKeyboardVisible: (v: boolean) => void;
  setKeyboardOpacity: (n: number) => void;
  setKeyboardIconSize: (n: number) => void;
  setKeyboardPosition: (x: number, y: number) => void;
  toggleKeyboardButton: (k: keyof KeyboardButtons) => void;

  // Scroll widget
  scroll: FloatingPanelPrefs;
  setScrollVisible: (v: boolean) => void;
  setScrollOpacity: (n: number) => void;
  setScrollIconSize: (n: number) => void;
  setScrollPosition: (x: number, y: number) => void;

  /** Active PTY id — the terminal the floating widgets target. Set by
   *  TerminalView on focus, cleared on blur or unmount. */
  activePtyId: string | null;
  setActivePtyId: (id: string | null) => void;
}

function persistKeyboard(state: typeof DEFAULT_KEYBOARD) {
  try { localStorage.setItem(KEYBOARD_KEY, JSON.stringify(state)); } catch { /* noop */ }
}
function persistScroll(state: FloatingPanelPrefs) {
  try { localStorage.setItem(SCROLL_KEY, JSON.stringify(state)); } catch { /* noop */ }
}

export const useKeyboardStore = create<KeyboardState>((set, get) => ({
  keyboard: loadKeyboard(),
  setKeyboardVisible: (visible) => {
    const next = { ...get().keyboard, visible };
    set({ keyboard: next });
    persistKeyboard(next);
  },
  setKeyboardOpacity: (opacity) => {
    const next = { ...get().keyboard, opacity: Math.max(20, Math.min(100, opacity)) };
    set({ keyboard: next });
    persistKeyboard(next);
  },
  setKeyboardIconSize: (iconSize) => {
    const next = { ...get().keyboard, iconSize: Math.max(12, Math.min(36, iconSize)) };
    set({ keyboard: next });
    persistKeyboard(next);
  },
  setKeyboardPosition: (positionX, positionY) => {
    const next = { ...get().keyboard, positionX, positionY };
    set({ keyboard: next });
    persistKeyboard(next);
  },
  toggleKeyboardButton: (k) => {
    const cur = get().keyboard;
    const next = { ...cur, buttons: { ...cur.buttons, [k]: !cur.buttons[k] } };
    set({ keyboard: next });
    persistKeyboard(next);
  },

  scroll: loadScroll(),
  setScrollVisible: (visible) => {
    const next = { ...get().scroll, visible };
    set({ scroll: next });
    persistScroll(next);
  },
  setScrollOpacity: (opacity) => {
    const next = { ...get().scroll, opacity: Math.max(20, Math.min(100, opacity)) };
    set({ scroll: next });
    persistScroll(next);
  },
  setScrollIconSize: (iconSize) => {
    const next = { ...get().scroll, iconSize: Math.max(12, Math.min(36, iconSize)) };
    set({ scroll: next });
    persistScroll(next);
  },
  setScrollPosition: (positionX, positionY) => {
    const next = { ...get().scroll, positionX, positionY };
    set({ scroll: next });
    persistScroll(next);
  },

  activePtyId: null,
  setActivePtyId: (id) => set({ activePtyId: id }),
}));
