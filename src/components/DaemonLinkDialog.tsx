import { useEffect, useMemo, useState } from 'react';
import { Link2, RefreshCw, Trash2 } from 'lucide-react';
import { fetchDaemonLinks, linkDaemonPair, unlinkDaemonPair } from '../api/daemonLinks';
import type { Agent, DaemonLink, Relay } from '../types';
import DialogShell from './dialogs/DialogShell';

export default function DaemonLinkDialog({
  open, source, relay, candidates, onClose,
}: {
  open: boolean;
  source: Agent | null;
  relay: Relay | null;
  candidates: Agent[];
  onClose: () => void;
}) {
  const [links, setLinks] = useState<DaemonLink[]>([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const byFingerprint = useMemo(() => new Map(candidates.map((agent) => [agent.fingerprint, agent])), [candidates]);
  const available = useMemo(() => candidates.filter((agent) => !links.some((link) => link.peer_fingerprint === agent.fingerprint)), [candidates, links]);

  const reload = async () => {
    if (!source) return;
    setBusy(true); setError('');
    try { setLinks((await fetchDaemonLinks(source.id)).links); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };

  useEffect(() => {
    if (!open) return;
    setLinks([]); setSelected(''); setError('');
    void reload();
  // Reload only when the dialog target changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source?.id]);

  const add = async () => {
    const peer = byFingerprint.get(selected);
    if (!source || !relay || !peer) return;
    setBusy(true); setError('');
    try { await linkDaemonPair(source, peer, relay); setSelected(''); setLinks((await fetchDaemonLinks(source.id)).links); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };

  const remove = async (link: DaemonLink) => {
    if (!source) return;
    setBusy(true); setError('');
    try { await unlinkDaemonPair(source, byFingerprint.get(link.peer_fingerprint), link.peer_fingerprint); setLinks((await fetchDaemonLinks(source.id)).links); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); await reload(); }
    finally { setBusy(false); }
  };

  return <DialogShell open={open} onClose={onClose} title={source ? `Links for ${source.name}` : 'Daemon links'} description="Direct daemon peers through this relay; one hop only" widthClassName="max-w-xl" footer={<button disabled={busy} onClick={onClose} className="rounded border border-canvas-border px-3 py-2 text-xs hover:bg-canvas-border disabled:opacity-50">Close</button>}>
    <div className="space-y-4">
      <div className="rounded border border-canvas-border bg-canvas-bg p-3">
        <div className="mb-2 text-xs text-canvas-muted">Link another daemon visible on {relay?.name || 'this relay'}</div>
        <div className="flex gap-2">
          <select value={selected} disabled={busy || available.length === 0} onChange={(event) => setSelected(event.target.value)} className="min-w-0 flex-1 rounded border border-canvas-border bg-canvas-surface px-3 py-2 text-xs outline-none focus:border-canvas-accent">
            <option value="">{available.length ? 'Select daemon…' : 'No unlinked online daemons'}</option>
            {available.map((agent) => <option key={agent.fingerprint} value={agent.fingerprint}>{agent.name} · {agent.fingerprint.slice(0, 12)}</option>)}
          </select>
          <button disabled={busy || !selected} onClick={() => void add()} className="inline-flex items-center gap-2 rounded border border-canvas-accent bg-canvas-accent/15 px-3 py-2 text-xs text-canvas-accent disabled:opacity-40"><Link2 size={13} />Link</button>
          <button disabled={busy} onClick={() => void reload()} className="rounded border border-canvas-border p-2 disabled:opacity-40" title="Refresh links"><RefreshCw size={13} /></button>
        </div>
      </div>
      <div className="space-y-2">
        {links.map((link) => <div key={link.peer_fingerprint} className="flex items-center gap-3 rounded border border-canvas-border px-3 py-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${link.state === 'active' ? 'bg-emerald-400' : link.state === 'pending' ? 'bg-amber-400' : 'bg-red-400'}`} />
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{link.name}</div><div className="truncate font-mono text-[10px] text-canvas-muted">{link.peer_fingerprint} · {link.relay_name} · {link.state}</div>{link.last_error && <div className="mt-1 text-[10px] text-red-300">{link.last_error}</div>}</div>
          <button disabled={busy} onClick={() => void remove(link)} className="rounded p-2 text-red-300 hover:bg-red-500/10 disabled:opacity-40" title={`Unlink ${link.name}`}><Trash2 size={14} /></button>
        </div>)}
        {!busy && links.length === 0 && <div className="py-6 text-center text-xs text-canvas-muted">No daemon links.</div>}
      </div>
      {error && <div role="alert" className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>}
    </div>
  </DialogShell>;
}
