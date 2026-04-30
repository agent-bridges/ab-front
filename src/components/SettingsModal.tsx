import { useState, useEffect } from 'react';
import DialogShell from './dialogs/DialogShell';
import { authFetch } from '../api/client';
import TouchKeysPanel from './keyboard/TouchKeysPanel';

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
  const [tab, setTab] = useState<'visual' | 'account' | 'auth'>('visual');

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

  // Authentication tab — client-cert (mTLS) state.
  // The cert.issued_at marks the moment of last rotation; we compare against
  // the localStorage "downloaded since" timestamp to gate the "require"
  // checkbox: only enabled once the user has actually downloaded the CURRENT
  // cert (a stale download from before the last regenerate doesn't count).
  type CertStatus = {
    has_cert: boolean;
    required: boolean;
    ca_fingerprint: string | null;
    leaf_fingerprint: string | null;
    issued_at: string | null;
    name: string | null;
    encrypted: boolean;
  };
  const [cert, setCert] = useState<CertStatus | null>(null);
  const [certBusy, setCertBusy] = useState<'gen' | 'dl' | 'req' | null>(null);
  const [certError, setCertError] = useState<string | null>(null);
  const [requireConfirmOpen, setRequireConfirmOpen] = useState(false);
  // Last issued_at the user has downloaded — persisted so reloading the
  // dialog after a download doesn't re-disable the checkbox.
  const [downloadedFor, setDownloadedFor] = useState<string | null>(() => {
    try { return localStorage.getItem('ab-client-cert-downloaded-for'); } catch { return null; }
  });
  // Verifier flow — calls the :5444 verifier nginx-port; the browser is
  // prompted for a cert, nginx forwards $ssl_client_* to the back as headers,
  // back replies with `matches_current_cert`. Only when that's true do we
  // consider the install confirmed and unlock the require-checkbox.
  type VerifyResult = {
    verified: boolean;
    matches_current_cert: boolean;
    verify_status: string;
    fingerprint: string | null;
    expected_fingerprint: string | null;
    subject: string | null;
  };
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifiedFor, setVerifiedFor] = useState<string | null>(() => {
    try { return localStorage.getItem('ab-client-cert-verified-for'); } catch { return null; }
  });
  // Optional inputs for the Generate flow. Both empty => server falls back
  // to a UTC-timestamped CN and an unencrypted .p12.
  const [genName, setGenName] = useState('');
  const [genPassword, setGenPassword] = useState('');

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

  // Load cert status whenever the auth tab is opened.
  const refreshCertStatus = async () => {
    setCertError(null);
    try {
      const res = await authFetch('/api/auth/client-cert/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCert(await res.json());
    } catch (e) {
      setCertError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    if (open && tab === 'auth') refreshCertStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab]);

  const handleGenerateCert = async () => {
    setCertBusy('gen');
    setCertError(null);
    try {
      const body: Record<string, string> = {};
      if (genName.trim()) body.name = genName.trim();
      if (genPassword) body.password = genPassword;
      const res = await authFetch('/api/auth/client-cert/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail || `HTTP ${res.status}`);
      }
      // Rotation happened; any prior download AND verification are now invalid.
      setDownloadedFor(null);
      setVerifiedFor(null);
      setVerifyResult(null);
      setGenName('');
      setGenPassword('');
      try {
        localStorage.removeItem('ab-client-cert-downloaded-for');
        localStorage.removeItem('ab-client-cert-verified-for');
      } catch { /* noop */ }
      await refreshCertStatus();
    } catch (e) {
      setCertError(e instanceof Error ? e.message : String(e));
    } finally {
      setCertBusy(null);
    }
  };

  const handleDownloadCert = async () => {
    setCertBusy('dl');
    setCertError(null);
    try {
      const res = await authFetch('/api/auth/client-cert/download');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      // Try to honour the server-supplied filename via Content-Disposition;
      // fall back to a default if missing. The CD looks like:
      //   attachment; filename="ab-client-2026-04-29-114520.p12"
      let filename = 'ab-client.p12';
      const cd = res.headers.get('content-disposition') || '';
      const m = cd.match(/filename="?([^";]+)"?/);
      if (m && m[1]) filename = m[1];
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      // Mark the current cert's issued_at as "downloaded" so the toggle unlocks.
      const issuedAt = cert?.issued_at ?? null;
      if (issuedAt) {
        setDownloadedFor(issuedAt);
        try { localStorage.setItem('ab-client-cert-downloaded-for', issuedAt); } catch { /* noop */ }
      }
    } catch (e) {
      setCertError(e instanceof Error ? e.message : String(e));
    } finally {
      setCertBusy(null);
    }
  };

  const handleRequireToggle = async (next: boolean) => {
    if (next) { setRequireConfirmOpen(true); return; }
    // Disabling needs no confirm — just flip.
    await applyRequireFlag(false);
  };
  const applyRequireFlag = async (enabled: boolean) => {
    setCertBusy('req');
    setCertError(null);
    try {
      const res = await authFetch('/api/auth/client-cert/require', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refreshCertStatus();
    } catch (e) {
      setCertError(e instanceof Error ? e.message : String(e));
    } finally {
      setCertBusy(null);
      setRequireConfirmOpen(false);
    }
  };

  const handleVerifyInBrowser = () => {
    if (!cert?.has_cert || !cert.leaf_fingerprint) {
      setVerifyError('Generate and download a cert first.');
      return;
    }
    setVerifyError(null);
    setVerifyResult(null);
    setVerifyBusy(true);

    const u = new URL(window.location.href);
    const verifierOrigin = `${u.protocol}//${u.hostname}:5444`;
    const verifierUrl = `${verifierOrigin}/api/auth/client-cert/whoami?html=1`;

    // Listen for the popup's postMessage callback. The popup is at :5444
    // (different origin from :5443), so we explicitly check `e.origin`.
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== verifierOrigin) return;
      const payload = e.data as { type?: string; data?: VerifyResult } | undefined;
      if (!payload || payload.type !== 'ab-client-cert-verify' || !payload.data) return;
      const data = payload.data;
      setVerifyResult(data);
      if (data.matches_current_cert && cert.issued_at) {
        setVerifiedFor(cert.issued_at);
        try { localStorage.setItem('ab-client-cert-verified-for', cert.issued_at); } catch { /* noop */ }
      }
      window.removeEventListener('message', onMessage);
      setVerifyBusy(false);
    };
    window.addEventListener('message', onMessage);

    // Open as a popup. Top-level navigation reliably triggers the browser's
    // self-signed-cert warning AND the client-cert chooser dialog, neither
    // of which a background `fetch` can pop. If popup-blocker eats it, fall
    // back to a same-tab navigation (user loses panel state but it works).
    const popup = window.open(verifierUrl, 'ab-cert-verify', 'popup=yes,width=520,height=440');
    if (!popup) {
      window.removeEventListener('message', onMessage);
      setVerifyBusy(false);
      setVerifyError('Popup blocked — allow popups for this site, or open the verifier link manually below.');
      return;
    }

    // If user closes the popup without selecting a cert, time out.
    const timeout = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      setVerifyBusy((busy) => {
        if (!busy) return busy;
        setVerifyError('Verification timed out. Did the popup get blocked or closed before you picked a cert?');
        return false;
      });
    }, 60_000);
    // Best-effort poll the popup; clear timer when it closes naturally.
    const closedPoll = setInterval(() => {
      if (popup.closed) {
        clearInterval(closedPoll);
        clearTimeout(timeout);
      }
    }, 500);
  };

  const openVerifierTab = () => {
    const u = new URL(window.location.href);
    const verifierUrl = `${u.protocol}//${u.hostname}:5444/api/auth/client-cert/whoami?html=1`;
    window.open(verifierUrl, '_blank', 'noopener');
  };

  // Unlock the require-checkbox only when the user has BOTH downloaded the
  // current cert AND verified the browser presents it. The localStorage
  // `verifiedFor` matches the issued_at so a regenerate invalidates it.
  const certVerifiedNow = !!cert?.has_cert && !!cert.issued_at && verifiedFor === cert.issued_at;
  const certCanRequire = certVerifiedNow && downloadedFor === cert!.issued_at;

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
      widthClassName="max-w-lg"
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
        <button
          onClick={() => setTab('auth')}
          className={`flex-1 py-2.5 text-xs font-medium text-center ${
            tab === 'auth'
              ? 'text-canvas-accent border-b-2 border-canvas-accent'
              : 'text-canvas-muted hover:text-canvas-text'
          }`}
        >
          Authentication
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

            {/* Touch-keys customization (moved here from a separate tab so all
                visual prefs live in one place — same shape as legacy AB1). */}
            <div className="pt-3 border-t border-canvas-border">
              <TouchKeysPanel />
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

        {tab === 'auth' && (
          <div className="space-y-4">
            <div className="text-xs font-semibold text-canvas-text mb-1">Client certificate (mTLS)</div>
            <div className="text-[11px] text-canvas-muted leading-relaxed">
              Issue a single shared client cert that browsers must present to access this panel.
              The .p12 file is the credential — install it in your browser keychain.
              Generating a new cert <span className="text-canvas-text">invalidates every previously issued copy</span> as soon as the edge reloads — that's how you revoke.
            </div>

            {certError && (
              <div className="text-xs text-red-400">✗ {certError}</div>
            )}

            <div className="rounded border border-canvas-border bg-canvas-bg p-3 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-canvas-muted">Status</span>
                <span className={cert?.has_cert ? 'text-green-400' : 'text-canvas-muted'}>
                  {cert?.has_cert ? 'Issued' : 'Not issued'}
                </span>
              </div>
              {cert?.name && (
                <div className="flex items-center justify-between text-[11px] gap-2">
                  <span className="text-canvas-muted">Name</span>
                  <span className="text-canvas-text font-mono truncate">{cert.name}</span>
                </div>
              )}
              {cert?.issued_at && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-canvas-muted">Issued</span>
                  <span className="text-canvas-text font-mono">{cert.issued_at.replace('T', ' ').replace('Z', '')}</span>
                </div>
              )}
              {cert && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-canvas-muted">Encrypted</span>
                  <span className={cert.encrypted ? 'text-canvas-accent' : 'text-canvas-muted'}>
                    {cert.encrypted ? 'YES' : 'no'}
                  </span>
                </div>
              )}
              {cert?.ca_fingerprint && (
                <div className="flex items-center justify-between text-[11px] gap-2">
                  <span className="text-canvas-muted">CA fp</span>
                  <span className="text-canvas-text font-mono truncate" title={cert.ca_fingerprint}>{cert.ca_fingerprint.slice(0, 16)}…</span>
                </div>
              )}
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-canvas-muted">Required</span>
                <span className={cert?.required ? 'text-canvas-accent' : 'text-canvas-muted'}>
                  {cert?.required ? 'YES' : 'no'}
                </span>
              </div>
            </div>

            {/* Inline form — both fields optional. Empty name → CN auto-set
                to a UTC timestamp (and that name becomes the download
                filename). Empty password → unencrypted .p12. */}
            <div className="space-y-2 rounded border border-canvas-border bg-canvas-bg p-3">
              <div>
                <label className="text-[11px] text-canvas-muted">Cert name (optional)</label>
                <input
                  type="text"
                  value={genName}
                  onChange={(e) => setGenName(e.target.value)}
                  disabled={certBusy !== null}
                  placeholder={`ab-client-${new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '')}`}
                  className="w-full mt-1 bg-canvas-surface border border-canvas-border rounded px-2 py-1.5 text-xs text-canvas-text font-mono outline-none focus:border-canvas-accent disabled:opacity-50"
                  maxLength={64}
                />
              </div>
              <div>
                <label className="text-[11px] text-canvas-muted">Password (optional)</label>
                <input
                  type="password"
                  value={genPassword}
                  onChange={(e) => setGenPassword(e.target.value)}
                  disabled={certBusy !== null}
                  placeholder="leave empty for an unencrypted .p12"
                  className="w-full mt-1 bg-canvas-surface border border-canvas-border rounded px-2 py-1.5 text-xs text-canvas-text outline-none focus:border-canvas-accent disabled:opacity-50"
                />
              </div>
              <div className="text-[10px] text-canvas-muted">
                Both empty = current default behaviour. Filling them only affects this generation.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleGenerateCert}
                disabled={certBusy !== null}
                className="py-2 rounded text-xs font-semibold bg-canvas-accent/10 border border-canvas-border text-canvas-text hover:bg-canvas-accent/20 disabled:opacity-30"
              >
                {certBusy === 'gen' ? 'Generating…' : (cert?.has_cert ? 'Regenerate cert' : 'Generate new cert')}
              </button>
              <button
                onClick={handleDownloadCert}
                disabled={certBusy !== null || !cert?.has_cert}
                className="py-2 rounded text-xs font-semibold bg-canvas-accent/10 border border-canvas-border text-canvas-text hover:bg-canvas-accent/20 disabled:opacity-30"
              >
                {certBusy === 'dl' ? 'Downloading…' : 'Download cert'}
              </button>
            </div>

            {/* Verify-in-browser flow: hits the :5444 verifier that asks the
                browser for a client cert. The user's browser will pop the
                cert chooser; if the picked cert's SHA1 fingerprint matches
                what the back issued (cert.leaf_fingerprint), we record
                verifiedFor and unlock the require-checkbox below. */}
            <div className="rounded border border-canvas-border bg-canvas-bg p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs text-canvas-text">Browser verification</div>
                  <div className="text-[11px] text-canvas-muted">
                    Confirms your browser actually presents the cert before we let you require it.
                  </div>
                </div>
                <div className="shrink-0 flex flex-col gap-1">
                  <button
                    onClick={handleVerifyInBrowser}
                    disabled={verifyBusy || !cert?.has_cert}
                    className="px-3 py-1.5 rounded text-xs font-semibold bg-canvas-accent/10 border border-canvas-border text-canvas-text hover:bg-canvas-accent/20 disabled:opacity-30"
                  >
                    {verifyBusy ? 'Checking…' : 'Verify in browser'}
                  </button>
                  <button
                    onClick={openVerifierTab}
                    disabled={!cert?.has_cert}
                    className="px-3 py-1.5 rounded text-[10px] text-canvas-muted border border-transparent hover:border-canvas-border disabled:opacity-30"
                    title="One-time: accept the self-signed cert warning + pick the client cert in a new tab"
                  >
                    Open verifier tab ↗
                  </button>
                </div>
              </div>
              {verifyError && <div className="text-[11px] text-red-400">✗ {verifyError}</div>}
              {verifyResult && (
                verifyResult.matches_current_cert ? (
                  <div className="text-[11px] text-green-400">
                    ✓ Verified — the browser is presenting the current cert
                    {verifyResult.fingerprint && <span className="font-mono opacity-70"> (sha1 {verifyResult.fingerprint.slice(0, 16)}…)</span>}.
                  </div>
                ) : verifyResult.verified ? (
                  <div className="text-[11px] text-yellow-400">
                    ⚠ A cert was presented but it doesn't match the current issued one. Did you regenerate after downloading? Re-download and retry.
                  </div>
                ) : (
                  <div className="text-[11px] text-yellow-400">
                    ⚠ No cert presented (status: {verifyResult.verify_status}). Make sure the .p12 is installed and the browser picked it.
                  </div>
                )
              )}
              {certVerifiedNow && !verifyResult && (
                <div className="text-[11px] text-green-400">✓ Previously verified for the current cert.</div>
              )}
            </div>

            <label className={`flex items-start gap-2 p-2 rounded border ${cert?.required ? 'border-canvas-accent bg-canvas-accent/5' : 'border-canvas-border'} ${certCanRequire || cert?.required ? '' : 'opacity-50'}`}>
              <input
                type="checkbox"
                checked={!!cert?.required}
                disabled={certBusy !== null || (!cert?.required && !certCanRequire)}
                onChange={(e) => handleRequireToggle(e.target.checked)}
                className="mt-0.5 accent-canvas-accent"
              />
              <div>
                <div className="text-xs text-canvas-text">Require client certificate</div>
                <div className="text-[11px] text-canvas-muted">
                  {cert?.required
                    ? 'On — browsers without the cert are refused at TLS handshake.'
                    : (certCanRequire
                      ? 'Browsers without the .p12 will be refused at TLS handshake.'
                      : !cert?.has_cert
                        ? 'Generate a cert first.'
                        : downloadedFor !== cert.issued_at
                          ? 'Download the current cert first.'
                          : !certVerifiedNow
                            ? 'Click "Verify in browser" first to confirm your browser actually presents the cert.'
                            : 'Browsers without the .p12 will be refused at TLS handshake.')}
                </div>
              </div>
            </label>

            {cert?.required && (
              <div className="text-[11px] leading-relaxed bg-canvas-accent/5 border border-canvas-accent/40 text-canvas-accent rounded p-2">
                <span className="font-semibold">✓ Enforced</span>
                {' '} — visiting <code className="font-mono">{`https://<host>:5443`}</code> redirects to <code className="font-mono">{`:5444`}</code>, which refuses any TLS handshake without a valid client cert. UI, /api and /ws are all gated.
              </div>
            )}
            {!cert?.required && cert?.has_cert && (
              <div className="text-[10px] leading-relaxed text-canvas-muted bg-canvas-bg border border-canvas-border rounded p-2">
                Toggle has no effect on the open <code className="font-mono">:5443</code> port; it just redirects you (and only you) to <code className="font-mono">:5444</code> on next page load. <code className="font-mono">:5443</code> stays open as a recovery channel — you can always toggle this back off from there if you ever lose the cert.
              </div>
            )}
          </div>
        )}

      </div>

      {/* Require-on confirmation dialog. */}
      {requireConfirmOpen && (
        <div className="fixed inset-0 z-[100200] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-xl border border-canvas-accent bg-canvas-surface p-5 space-y-3">
            <div className="text-sm font-semibold text-canvas-text">Lockout warning</div>
            <div className="text-xs text-canvas-muted leading-relaxed">
              You're about to require a client certificate for ALL access on port 5443.
              <span className="block mt-2">
                Before you reload the page, install <code className="font-mono text-canvas-text">ab-client.p12</code> in your browser/keychain — and run the apply command on the host.
                If you skip either, you'll be locked out and recovery requires SSH.
              </span>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRequireConfirmOpen(false)}
                disabled={certBusy !== null}
                className="px-3 py-1.5 rounded border border-canvas-border text-xs text-canvas-text hover:bg-canvas-border"
              >
                Cancel
              </button>
              <button
                onClick={() => applyRequireFlag(true)}
                disabled={certBusy !== null}
                className="px-3 py-1.5 rounded border border-canvas-accent text-xs font-semibold text-canvas-accent bg-canvas-accent/10 hover:bg-canvas-accent/20"
              >
                I've installed the cert — require it
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogShell>
  );
}

