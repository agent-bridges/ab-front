import { useState, useEffect } from 'react';
import { X, Wrench } from 'lucide-react';

const FONT_SIZE_KEY = 'ab-terminal-font-size';
const SCROLL_SPEED_KEY = 'ab-touch-scroll-speed';
const THEME_KEY = 'ab-theme';

function loadSetting(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    return v ? Number(v) : fallback;
  } catch { return fallback; }
}

function saveSetting(key: string, value: number) {
  try { localStorage.setItem(key, String(value)); } catch {}
}

function loadTheme(): 'dark' | 'light' {
  try {
    return (localStorage.getItem(THEME_KEY) as 'dark' | 'light') || 'dark';
  } catch { return 'dark'; }
}

function saveTheme(theme: 'dark' | 'light') {
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function MobileSettingsPanel({ open, onClose }: Props) {
  const [fontSize, setFontSize] = useState(() => loadSetting(FONT_SIZE_KEY, 14));
  const [scrollSpeed, setScrollSpeed] = useState(() => loadSetting(SCROLL_SPEED_KEY, 5));
  const [theme, setTheme] = useState(loadTheme);

  useEffect(() => {
    saveSetting(FONT_SIZE_KEY, fontSize);
    window.dispatchEvent(new CustomEvent('ab-settings-change', { detail: { fontSize } }));
  }, [fontSize]);

  useEffect(() => {
    saveSetting(SCROLL_SPEED_KEY, scrollSpeed);
    window.dispatchEvent(new CustomEvent('ab-settings-change', { detail: { scrollSpeed } }));
  }, [scrollSpeed]);

  useEffect(() => {
    saveTheme(theme);
    window.dispatchEvent(new CustomEvent('ab-settings-change', { detail: { theme } }));
  }, [theme]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[90]" onClick={onClose} />
      <div className="fixed top-0 right-0 bottom-0 w-[300px] bg-canvas-surface border-l border-canvas-border z-[91] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-canvas-border">
          <div className="flex items-center gap-2">
            <Wrench size={16} className="text-canvas-accent" />
            <span className="text-sm font-semibold text-canvas-text">Settings</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-canvas-border rounded">
            <X size={16} className="text-canvas-muted" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Appearance */}
          <div className="rounded-lg border border-canvas-border p-3">
            <div className="text-xs font-semibold text-canvas-text mb-3">Appearance</div>
            <div className="text-[11px] text-canvas-muted mb-2">Theme</div>
            <div className="flex gap-1">
              <button
                onClick={() => setTheme('dark')}
                className={`px-3 py-1.5 rounded text-xs font-medium ${
                  theme === 'dark'
                    ? 'bg-canvas-accent/20 text-canvas-accent border border-canvas-accent'
                    : 'bg-canvas-bg text-canvas-muted border border-canvas-border hover:bg-canvas-border'
                }`}
              >
                Dark
              </button>
              <button
                onClick={() => setTheme('light')}
                className={`px-3 py-1.5 rounded text-xs font-medium ${
                  theme === 'light'
                    ? 'bg-canvas-accent/20 text-canvas-accent border border-canvas-accent'
                    : 'bg-canvas-bg text-canvas-muted border border-canvas-border hover:bg-canvas-border'
                }`}
              >
                Light
              </button>
            </div>
          </div>

          {/* Terminal */}
          <div className="rounded-lg border border-canvas-border p-3">
            <div className="text-xs font-semibold text-canvas-text mb-3">Terminal</div>

            {/* Font Size */}
            <div className="mb-4">
              <div className="text-[11px] text-canvas-muted mb-2">Font Size</div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={8}
                  max={24}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="flex-1 h-1 rounded-full appearance-none bg-canvas-border accent-canvas-accent cursor-pointer"
                  style={{ accentColor: 'var(--canvas-accent, #d4a574)' }}
                />
                <div className="w-8 h-6 flex items-center justify-center rounded border border-canvas-border text-[11px] text-canvas-text bg-canvas-bg">
                  {fontSize}
                </div>
              </div>
            </div>

            {/* Touch Scroll Speed */}
            <div>
              <div className="text-[11px] text-canvas-muted mb-2">Touch Scroll Speed</div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={scrollSpeed}
                  onChange={(e) => setScrollSpeed(Number(e.target.value))}
                  className="flex-1 h-1 rounded-full appearance-none bg-canvas-border cursor-pointer"
                  style={{ accentColor: 'var(--canvas-accent, #d4a574)' }}
                />
                <div className="w-8 h-6 flex items-center justify-center rounded border border-canvas-border text-[11px] text-canvas-text bg-canvas-bg">
                  {scrollSpeed}x
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Export helpers for other components to read settings
export function getTerminalFontSize(): number {
  return loadSetting(FONT_SIZE_KEY, 14);
}

export function getTouchScrollSpeed(): number {
  return loadSetting(SCROLL_SPEED_KEY, 5);
}

export function getTheme(): 'dark' | 'light' {
  return loadTheme();
}
