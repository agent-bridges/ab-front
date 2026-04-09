import { useState, useEffect } from 'react';
import DialogShell from './dialogs/DialogShell';
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

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SettingsModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<'visual' | 'account'>('visual');

  // Visual
  const [fontSize, setFontSize] = useState(() => load(FONT_SIZE_KEY, 14));
  const [scrollSpeed, setScrollSpeed] = useState(() => load(SCROLL_SPEED_KEY, 5));
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return (localStorage.getItem(THEME_KEY) as 'dark' | 'light') || 'dark'; } catch { return 'dark'; }
  });

  // Account
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwStatus, setPwStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

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

  // Reset account form when opening
  useEffect(() => {
    if (open) {
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setPwStatus(null);
    }
  }, [open]);

  const handleChangePassword = async () => {
    if (!currentPw || !newPw) { setPwStatus({ ok: false, msg: 'Fill in all fields' }); return; }
    if (newPw !== confirmPw) { setPwStatus({ ok: false, msg: 'Passwords do not match' }); return; }
    if (newPw.length < 6) { setPwStatus({ ok: false, msg: 'Password too short (min 6)' }); return; }

    setPwSaving(true);
    setPwStatus(null);
    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      });
      if (res.ok) {
        setPwStatus({ ok: true, msg: 'Password changed' });
        setCurrentPw('');
        setNewPw('');
        setConfirmPw('');
      } else {
        const data = await res.json().catch(() => ({}));
        setPwStatus({ ok: false, msg: data.detail || 'Failed to change password' });
      }
    } catch {
      setPwStatus({ ok: false, msg: 'Network error' });
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title="Settings"
      widthClassName="max-w-md"
      bodyClassName="p-0"
    >
      {/* Tabs */}
      <div className="flex border-b border-canvas-border">
        <button
          onClick={() => setTab('visual')}
          className={`flex-1 py-2.5 text-xs font-medium text-center ${
            tab === 'visual'
              ? 'text-canvas-accent border-b-2 border-canvas-accent'
              : 'text-canvas-muted hover:text-canvas-text'
          }`}
        >
          Visual
        </button>
        <button
          onClick={() => setTab('account')}
          className={`flex-1 py-2.5 text-xs font-medium text-center ${
            tab === 'account'
              ? 'text-canvas-accent border-b-2 border-canvas-accent'
              : 'text-canvas-muted hover:text-canvas-text'
          }`}
        >
          Account
        </button>
      </div>

      <div className="p-5">
        {tab === 'visual' && (
          <div className="space-y-5">
            {/* Theme */}
            <div>
              <div className="text-xs font-semibold text-canvas-text mb-2">Theme</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setTheme('dark')}
                  className={`px-4 py-1.5 rounded text-xs font-medium ${
                    theme === 'dark'
                      ? 'bg-canvas-accent/20 text-canvas-accent border border-canvas-accent'
                      : 'bg-canvas-bg text-canvas-muted border border-canvas-border hover:bg-canvas-border'
                  }`}
                >
                  Dark
                </button>
                <button
                  onClick={() => setTheme('light')}
                  className={`px-4 py-1.5 rounded text-xs font-medium ${
                    theme === 'light'
                      ? 'bg-canvas-accent/20 text-canvas-accent border border-canvas-accent'
                      : 'bg-canvas-bg text-canvas-muted border border-canvas-border hover:bg-canvas-border'
                  }`}
                >
                  Light
                </button>
              </div>
            </div>

            {/* Font Size */}
            <div>
              <div className="text-xs font-semibold text-canvas-text mb-2">Terminal Font Size</div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={8}
                  max={24}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="flex-1 h-1 rounded-full appearance-none bg-canvas-border cursor-pointer"
                  style={{ accentColor: 'var(--canvas-accent, #d4a574)' }}
                />
                <div className="w-10 h-7 flex items-center justify-center rounded border border-canvas-border text-xs text-canvas-text bg-canvas-bg">
                  {fontSize}
                </div>
              </div>
            </div>

            {/* Scroll Speed */}
            <div>
              <div className="text-xs font-semibold text-canvas-text mb-2">Touch Scroll Speed</div>
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
                <div className="w-10 h-7 flex items-center justify-center rounded border border-canvas-border text-xs text-canvas-text bg-canvas-bg">
                  {scrollSpeed}x
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'account' && (
          <div className="space-y-4">
            <div className="text-xs font-semibold text-canvas-text mb-1">Change Password</div>

            <div>
              <label className="text-[11px] text-canvas-muted">Current password</label>
              <input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className="w-full mt-1 bg-canvas-bg border border-canvas-border rounded px-3 py-1.5 text-xs text-canvas-text outline-none focus:border-canvas-accent"
              />
            </div>

            <div>
              <label className="text-[11px] text-canvas-muted">New password</label>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="w-full mt-1 bg-canvas-bg border border-canvas-border rounded px-3 py-1.5 text-xs text-canvas-text outline-none focus:border-canvas-accent"
              />
            </div>

            <div>
              <label className="text-[11px] text-canvas-muted">Confirm new password</label>
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className="w-full mt-1 bg-canvas-bg border border-canvas-border rounded px-3 py-1.5 text-xs text-canvas-text outline-none focus:border-canvas-accent"
              />
            </div>

            {pwStatus && (
              <div className={`text-xs ${pwStatus.ok ? 'text-green-400' : 'text-red-400'}`}>
                {pwStatus.ok ? '✓' : '✗'} {pwStatus.msg}
              </div>
            )}

            <button
              onClick={handleChangePassword}
              disabled={pwSaving}
              className="w-full py-2 rounded text-xs font-semibold bg-canvas-accent/20 border border-canvas-accent text-canvas-accent hover:bg-canvas-accent/30 disabled:opacity-30"
            >
              {pwSaving ? 'Saving...' : 'Change Password'}
            </button>
          </div>
        )}
      </div>
    </DialogShell>
  );
}
