import { useState, useEffect } from 'react';
import { X, Wrench, User } from 'lucide-react';
import { authFetch } from '../api/client';

const FONT_SIZE_KEY = 'ab-terminal-font-size';
const SCROLL_SPEED_KEY = 'ab-touch-scroll-speed';
const THEME_KEY = 'ab-theme';

function load(key: string, fallback: number): number {
  try { const v = localStorage.getItem(key); return v ? Number(v) : fallback; } catch { return fallback; }
}
function save(key: string, value: number) {
  try { localStorage.setItem(key, String(value)); } catch {}
}

// --- Visual Panel ---
export function MobileVisualPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [fontSize, setFontSize] = useState(() => load(FONT_SIZE_KEY, 14));
  const [scrollSpeed, setScrollSpeed] = useState(() => load(SCROLL_SPEED_KEY, 5));
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return (localStorage.getItem(THEME_KEY) as 'dark' | 'light') || 'dark'; } catch { return 'dark'; }
  });

  useEffect(() => {
    save(FONT_SIZE_KEY, fontSize);
    window.dispatchEvent(new CustomEvent('ab-settings-change', { detail: { fontSize } }));
  }, [fontSize]);

  useEffect(() => {
    save(SCROLL_SPEED_KEY, scrollSpeed);
    window.dispatchEvent(new CustomEvent('ab-settings-change', { detail: { scrollSpeed } }));
  }, [scrollSpeed]);

  useEffect(() => {
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    window.dispatchEvent(new CustomEvent('ab-settings-change', { detail: { theme } }));
  }, [theme]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[90]" onClick={onClose} />
      <div className="fixed top-0 right-0 bottom-0 w-[300px] bg-canvas-surface border-l border-canvas-border z-[91] flex flex-col">
        <div className="flex items-center justify-between p-3 border-b border-canvas-border">
          <div className="flex items-center gap-2">
            <Wrench size={16} className="text-canvas-accent" />
            <span className="text-sm font-semibold text-canvas-text">Visual</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-canvas-border rounded">
            <X size={16} className="text-canvas-muted" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div>
            <div className="text-[11px] text-canvas-muted mb-2">Theme</div>
            <div className="flex gap-1">
              {(['dark', 'light'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`px-3 py-1.5 rounded text-xs font-medium capitalize ${
                    theme === t
                      ? 'bg-canvas-accent/20 text-canvas-accent border border-canvas-accent'
                      : 'bg-canvas-bg text-canvas-muted border border-canvas-border hover:bg-canvas-border'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11px] text-canvas-muted mb-2">Font Size</div>
            <div className="flex items-center gap-3">
              <input type="range" min={8} max={24} value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="flex-1 h-1 rounded-full appearance-none bg-canvas-border cursor-pointer"
                style={{ accentColor: 'var(--canvas-accent, #d4a574)' }}
              />
              <div className="w-8 h-6 flex items-center justify-center rounded border border-canvas-border text-[11px] text-canvas-text bg-canvas-bg">{fontSize}</div>
            </div>
          </div>

          <div>
            <div className="text-[11px] text-canvas-muted mb-2">Touch Scroll Speed</div>
            <div className="flex items-center gap-3">
              <input type="range" min={1} max={10} value={scrollSpeed}
                onChange={(e) => setScrollSpeed(Number(e.target.value))}
                className="flex-1 h-1 rounded-full appearance-none bg-canvas-border cursor-pointer"
                style={{ accentColor: 'var(--canvas-accent, #d4a574)' }}
              />
              <div className="w-8 h-6 flex items-center justify-center rounded border border-canvas-border text-[11px] text-canvas-text bg-canvas-bg">{scrollSpeed}x</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// --- Account Panel ---
export function MobileAccountPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setCurrentPw(''); setNewPw(''); setConfirmPw(''); setStatus(null); }
  }, [open]);

  const handleChange = async () => {
    if (!currentPw || !newPw) { setStatus({ ok: false, msg: 'Fill in all fields' }); return; }
    if (newPw !== confirmPw) { setStatus({ ok: false, msg: 'Passwords do not match' }); return; }
    if (newPw.length < 6) { setStatus({ ok: false, msg: 'Min 6 characters' }); return; }

    setSaving(true);
    setStatus(null);
    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      });
      if (res.ok) {
        setStatus({ ok: true, msg: 'Password changed' });
        setCurrentPw(''); setNewPw(''); setConfirmPw('');
      } else {
        const data = await res.json().catch(() => ({}));
        setStatus({ ok: false, msg: data.detail || 'Failed' });
      }
    } catch { setStatus({ ok: false, msg: 'Network error' }); }
    finally { setSaving(false); }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[90]" onClick={onClose} />
      <div className="fixed top-0 right-0 bottom-0 w-[300px] bg-canvas-surface border-l border-canvas-border z-[91] flex flex-col">
        <div className="flex items-center justify-between p-3 border-b border-canvas-border">
          <div className="flex items-center gap-2">
            <User size={16} className="text-canvas-accent" />
            <span className="text-sm font-semibold text-canvas-text">Account</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-canvas-border rounded">
            <X size={16} className="text-canvas-muted" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="text-xs font-semibold text-canvas-text">Change Password</div>
          <input type="password" placeholder="Current password" value={currentPw}
            onChange={(e) => setCurrentPw(e.target.value)}
            className="w-full bg-canvas-bg border border-canvas-border rounded px-3 py-2 text-xs text-canvas-text outline-none focus:border-canvas-accent"
          />
          <input type="password" placeholder="New password" value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            className="w-full bg-canvas-bg border border-canvas-border rounded px-3 py-2 text-xs text-canvas-text outline-none focus:border-canvas-accent"
          />
          <input type="password" placeholder="Confirm new password" value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            className="w-full bg-canvas-bg border border-canvas-border rounded px-3 py-2 text-xs text-canvas-text outline-none focus:border-canvas-accent"
          />
          {status && (
            <div className={`text-xs ${status.ok ? 'text-green-400' : 'text-red-400'}`}>
              {status.ok ? '✓' : '✗'} {status.msg}
            </div>
          )}
          <button onClick={handleChange} disabled={saving}
            className="w-full py-2 rounded text-xs font-semibold bg-canvas-accent/20 border border-canvas-accent text-canvas-accent hover:bg-canvas-accent/30 disabled:opacity-30"
          >
            {saving ? 'Saving...' : 'Change Password'}
          </button>
        </div>
      </div>
    </>
  );
}

// Export helpers
export function getTerminalFontSize(): number { return load(FONT_SIZE_KEY, 14); }
export function getTouchScrollSpeed(): number { return load(SCROLL_SPEED_KEY, 5); }
