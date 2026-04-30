import { useCallback, useEffect, useRef, useState } from 'react';
import { Pencil, Trash2, Plus, RefreshCw, ExternalLink } from 'lucide-react';
import type { CanvasItem } from '../../types';
import { listTunnels, createTunnel, killTunnel, type TunnelEntry, type TunnelsList } from '../../api/tunnels';
import DialogShell from '../dialogs/DialogShell';
import ConfirmDialog from '../dialogs/ConfirmDialog';

/**
 * Singleton canvas view — GUI for the host-side `tu` SSH-tunnel script.
 * Reads from /api/agents/{id}/tunnels (proxied by ab-back to ab-pty's
 * /api/tunnels which shells out to /lxd-exch/system/tu). Provides:
 *   - refresh (also driven by the Window toolbar's "ab-tunnels-refresh" event)
 *   - create-tunnel modal (local + public ports)
 *   - per-row edit (= kill + recreate) and delete (= kill PID)
 */
export default function TunnelsView({ item }: { item: CanvasItem }) {
  const agentId = item.agentId ?? null;
  const [data, setData] = useState<TunnelsList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TunnelEntry | null>(null);
  const [killTarget, setKillTarget] = useState<TunnelEntry | null>(null);
  const [killBusy, setKillBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!agentId) {
      setError('Open this on an agent board.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await listTunnels(agentId);
      setData(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { refresh(); }, [refresh]);

  // The Window toolbar's "Refresh" button dispatches this event so we don't
  // have to plumb a ref handle through the canvas tree.
  useEffect(() => {
    const onEv = (ev: Event) => {
      const ce = ev as CustomEvent<{ itemId: string }>;
      if (ce.detail?.itemId === item.id) refresh();
    };
    window.addEventListener('ab-tunnels-refresh', onEv);
    return () => window.removeEventListener('ab-tunnels-refresh', onEv);
  }, [item.id, refresh]);

  const onCreated = (next: TunnelsList) => {
    setData(next);
    setCreateOpen(false);
    setEditTarget(null);
  };

  const doKill = async (entry: TunnelEntry) => {
    if (!agentId) return;
    setKillBusy(true);
    try {
      const next = await killTunnel(agentId, entry.pid);
      setData(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setKillBusy(false);
      setKillTarget(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas-bg text-canvas-text">
      <div className="flex items-center gap-2 border-b border-canvas-border px-3 py-2">
        <button
          className="flex items-center gap-1 rounded border border-canvas-border px-2 py-1 text-xs hover:bg-canvas-border"
          onClick={() => setCreateOpen(true)}
          disabled={!agentId || (data ? !data.installed : false)}
          title="Create tunnel"
        >
          <Plus size={12} /> Create tunnel
        </button>
        <button
          className="flex items-center gap-1 rounded border border-canvas-border px-2 py-1 text-xs hover:bg-canvas-border"
          onClick={refresh}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
        {data && !data.installed && (
          <span className="text-xs text-canvas-muted">{data.message ?? 'tu not installed'}</span>
        )}
      </div>

      {error && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {data?.tunnels?.length ? (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-canvas-surface text-canvas-muted">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">PID</th>
                <th className="px-3 py-1.5 text-left font-medium">Local</th>
                <th className="px-3 py-1.5 text-left font-medium">Public</th>
                <th className="px-3 py-1.5 text-left font-medium">URL</th>
                <th className="px-3 py-1.5 text-left font-medium">Status</th>
                <th className="px-3 py-1.5 text-right font-medium w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.tunnels.map((t) => (
                <tr key={t.pid} className="border-t border-canvas-border hover:bg-canvas-border/40">
                  <td className="px-3 py-1.5 font-mono">{t.pid}</td>
                  <td className="px-3 py-1.5 font-mono">:{t.src_port}</td>
                  <td className="px-3 py-1.5 font-mono">:{t.dst_port}</td>
                  <td className="px-3 py-1.5">
                    <a
                      href={t.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-canvas-accent hover:underline"
                    >
                      {t.url}
                      <ExternalLink size={10} />
                    </a>
                  </td>
                  <td className="px-3 py-1.5">{t.status}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="rounded p-1 text-canvas-muted hover:bg-canvas-border hover:text-canvas-text"
                        onClick={() => setEditTarget(t)}
                        title="Edit (kill + recreate)"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        className="rounded p-1 text-canvas-muted hover:bg-red-500/20 hover:text-red-400"
                        onClick={() => setKillTarget(t)}
                        title="Delete tunnel"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-xs text-canvas-muted">
            {data?.installed === false
              ? data.message ?? 'tu not installed on this host'
              : loading
                ? 'Loading…'
                : 'No active tunnels.'}
          </div>
        )}
      </div>

      <TunnelEditDialog
        open={createOpen}
        title="Create tunnel"
        confirmLabel="Open tunnel"
        agentId={agentId}
        initial={null}
        onClose={() => setCreateOpen(false)}
        onCreated={onCreated}
      />
      <TunnelEditDialog
        open={editTarget !== null}
        title={editTarget ? `Edit tunnel (PID ${editTarget.pid})` : ''}
        confirmLabel="Replace"
        replacePid={editTarget?.pid ?? null}
        agentId={agentId}
        initial={editTarget}
        onClose={() => setEditTarget(null)}
        onCreated={onCreated}
      />
      <ConfirmDialog
        open={killTarget !== null}
        title={killTarget ? `Delete tunnel PID ${killTarget.pid}?` : ''}
        message={killTarget ? `Closes ${killTarget.url} (local :${killTarget.src_port}).` : ''}
        confirmLabel="Delete"
        confirmTone="danger"
        busy={killBusy}
        onConfirm={() => killTarget && doKill(killTarget)}
        onClose={() => setKillTarget(null)}
      />
    </div>
  );
}

function TunnelEditDialog({
  open, title, confirmLabel, agentId, initial, replacePid, onClose, onCreated,
}: {
  open: boolean;
  title: string;
  confirmLabel: string;
  agentId: string | null;
  initial: TunnelEntry | null;
  replacePid?: string | null;
  onClose: () => void;
  onCreated: (next: TunnelsList) => void;
}) {
  const [src, setSrc] = useState('');
  const [dst, setDst] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const srcRef = useRef<HTMLInputElement>(null);

  // Reset on open with fresh defaults from the row being edited.
  useEffect(() => {
    if (!open) return;
    setSrc(initial?.src_port ?? '');
    setDst(initial?.dst_port ?? '');
    setErr(null);
    setBusy(false);
    setTimeout(() => srcRef.current?.focus(), 0);
  }, [open, initial]);

  const validate = (): string | null => {
    const sn = parseInt(src, 10);
    const dn = parseInt(dst, 10);
    if (!Number.isFinite(sn) || sn <= 0 || sn > 65535) return 'Local port must be 1–65535.';
    if (!Number.isFinite(dn) || dn <= 0 || dn > 65535) return 'Public port must be 1–65535.';
    return null;
  };

  const submit = async () => {
    const v = validate();
    if (v) { setErr(v); return; }
    if (!agentId) { setErr('No agent selected.'); return; }
    setBusy(true);
    setErr(null);
    try {
      // Edit = kill old + create new. Order matters: kill first so the public
      // port is free if the user is reassigning the same dst_port.
      if (replacePid) {
        await killTunnel(agentId, replacePid);
      }
      const next = await createTunnel(agentId, src, dst);
      onCreated(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DialogShell
      open={open}
      onClose={busy ? () => {} : onClose}
      title={title}
      description="Forwards a public port on vultr (209.250.240.193) to a local port on this host."
      widthClassName="max-w-md"
      footer={(
        <>
          <button
            className="rounded-md border border-canvas-border px-3 py-2 text-xs text-canvas-text hover:bg-canvas-border disabled:opacity-50"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            className="rounded-md border border-canvas-accent/40 px-3 py-2 text-xs text-canvas-accent hover:bg-canvas-accent/10 disabled:opacity-50"
            onClick={submit}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      )}
    >
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-canvas-muted">Local port (your machine)</label>
          <input
            ref={srcRef}
            className="mt-1 w-full rounded border border-canvas-border bg-canvas-bg px-2 py-1.5 text-sm text-canvas-text outline-none focus:border-canvas-accent"
            value={src}
            inputMode="numeric"
            placeholder="3000"
            onChange={(e) => setSrc(e.target.value.trim())}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
        </div>
        <div>
          <label className="block text-xs text-canvas-muted">Public port (vultr)</label>
          <input
            className="mt-1 w-full rounded border border-canvas-border bg-canvas-bg px-2 py-1.5 text-sm text-canvas-text outline-none focus:border-canvas-accent"
            value={dst}
            inputMode="numeric"
            placeholder="30001"
            onChange={(e) => setDst(e.target.value.trim())}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
          {dst && /^\d+$/.test(dst) && (
            <div className="mt-1 text-[10px] text-canvas-muted">→ http://209.250.240.193:{dst}</div>
          )}
        </div>
        {err && <div className="rounded bg-red-500/10 px-2 py-1.5 text-xs text-red-300">{err}</div>}
      </div>
    </DialogShell>
  );
}
