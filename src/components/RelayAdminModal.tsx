import { useEffect, useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import type { Relay } from '../types';
import { createRelay, deleteRelay, RelayRevisionConflict, updateRelay, type RelayCreateInput } from '../api/relayAdmin';
import ConfirmDialog from './dialogs/ConfirmDialog';
import DialogShell from './dialogs/DialogShell';

export interface RelayFormState {
  id: string;
  name: string;
  address: string;
  serverFingerprint: string;
  enabled: boolean;
}

export const EMPTY_RELAY_FORM: RelayFormState = {
  id: '', name: '', address: '', serverFingerprint: '', enabled: true,
};

export function normalizeRelayFingerprint(value: string): string {
  return value.replace(/[\s:]/g, '').toLowerCase();
}

export function validateRelayForm(form: RelayFormState, creating: boolean): string | null {
  if (creating && !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(form.id.trim())) return 'ID must start with a lowercase letter or number and use only lowercase letters, numbers, _ and -.';
  if (!form.name.trim()) return 'Name is required.';
  if (!form.address.trim()) return 'Address is required.';
  const fingerprint = normalizeRelayFingerprint(form.serverFingerprint);
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) return 'Server fingerprint must contain 64 hexadecimal characters.';
  return null;
}

export function relayFormPayload(form: RelayFormState): RelayCreateInput {
  return {
    id: form.id.trim(),
    name: form.name.trim(),
    address: form.address.trim(),
    server_fingerprint: normalizeRelayFingerprint(form.serverFingerprint),
    enabled: form.enabled,
  };
}

interface Props {
  open: boolean;
  relay: Relay | null;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  confirmDeleteOnOpen?: boolean;
  revision: number | null;
}

export default function RelayAdminModal({ open, relay, onClose, onChanged, revision, confirmDeleteOnOpen = false }: Props) {
  const creating = relay === null;
  const [form, setForm] = useState<RelayFormState>(EMPTY_RELAY_FORM);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(relay ? {
      id: relay.id,
      name: relay.name,
      address: relay.address,
      serverFingerprint: relay.server_fingerprint,
      enabled: relay.enabled,
    } : EMPTY_RELAY_FORM);
    setError('');
    setBusy(false);
    setDeleteOpen(Boolean(relay && confirmDeleteOnOpen));
  }, [confirmDeleteOnOpen, open, relay]);

  const save = async () => {
    if (revision === null) { setError('Relay revision is unavailable. Reload the relay tree.'); return; }
    const validation = validateRelayForm(form, creating);
    if (validation) { setError(validation); return; }
    const payload = relayFormPayload(form);
    setBusy(true); setError('');
    try {
      if (creating) await createRelay(revision, payload);
      else await updateRelay(revision, relay.id, {
        name: payload.name,
        address: payload.address,
        server_fingerprint: payload.server_fingerprint,
        enabled: payload.enabled,
      });
      await onChanged();
      onClose();
    } catch (reason) {
      if (reason instanceof RelayRevisionConflict) await onChanged();
      setError(reason instanceof Error ? reason.message : 'Relay update failed');
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!relay) return;
    if (revision === null) { setDeleteOpen(false); setError('Relay revision is unavailable. Reload the relay tree.'); return; }
    setBusy(true); setError('');
    try {
      await deleteRelay(revision, relay.id);
      await onChanged();
      setDeleteOpen(false);
      onClose();
    } catch (reason) {
      setDeleteOpen(false);
      if (reason instanceof RelayRevisionConflict) await onChanged();
      setError(reason instanceof Error ? reason.message : 'Relay deletion failed');
    } finally { setBusy(false); }
  };

  return (
    <>
      <DialogShell open={open} onClose={onClose} title={creating ? 'Add relay' : `Edit ${relay.name}`} description="Relay transport endpoint and pinned public server identity" widthClassName="max-w-lg" footer={<>
        {!creating && <button disabled={busy} onClick={() => setDeleteOpen(true)} className="mr-auto inline-flex items-center gap-2 rounded border border-red-500/30 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"><Trash2 size={13} />Delete</button>}
        <button disabled={busy} onClick={onClose} className="rounded border border-canvas-border px-3 py-2 text-xs hover:bg-canvas-border disabled:opacity-50">Cancel</button>
        <button disabled={busy} onClick={() => void save()} className="inline-flex items-center gap-2 rounded border border-canvas-accent bg-canvas-accent/15 px-3 py-2 text-xs text-canvas-accent hover:bg-canvas-accent/25 disabled:opacity-50"><Save size={13} />{busy ? 'Saving…' : creating ? 'Add relay' : 'Save'}</button>
      </>}>
        <div className="space-y-4">
          <label className="block"><span className="text-xs text-canvas-muted">ID</span><input value={form.id} disabled={!creating || busy} onChange={(event) => setForm((state) => ({ ...state, id: event.target.value }))} placeholder="home" className="mt-1 w-full rounded border border-canvas-border bg-canvas-bg px-3 py-2 text-sm outline-none focus:border-canvas-accent disabled:opacity-60" /></label>
          <label className="block"><span className="text-xs text-canvas-muted">Name</span><input value={form.name} disabled={busy} onChange={(event) => setForm((state) => ({ ...state, name: event.target.value }))} placeholder="Home" className="mt-1 w-full rounded border border-canvas-border bg-canvas-bg px-3 py-2 text-sm outline-none focus:border-canvas-accent" /></label>
          <label className="block"><span className="text-xs text-canvas-muted">Address</span><input value={form.address} disabled={busy} onChange={(event) => setForm((state) => ({ ...state, address: event.target.value }))} placeholder="192.168.1.7:9500" className="mt-1 w-full rounded border border-canvas-border bg-canvas-bg px-3 py-2 font-mono text-sm outline-none focus:border-canvas-accent" /></label>
          <label className="block"><span className="text-xs text-canvas-muted">Server fingerprint (public pin)</span><textarea value={form.serverFingerprint} disabled={busy} onChange={(event) => setForm((state) => ({ ...state, serverFingerprint: event.target.value }))} rows={4} placeholder="Paste hexadecimal fingerprint; spaces, colons and line breaks are accepted" className="mt-1 w-full resize-y rounded border border-canvas-border bg-canvas-bg px-3 py-2 font-mono text-xs outline-none focus:border-canvas-accent" /><span className="mt-1 block text-[10px] text-canvas-muted">This is a public TLS pin, not a private key or JWT.</span></label>
          <label className="flex items-center gap-3 rounded border border-canvas-border px-3 py-2"><input type="checkbox" checked={form.enabled} disabled={busy} onChange={(event) => setForm((state) => ({ ...state, enabled: event.target.checked }))} /><span className="text-sm">Enabled</span></label>
          {error && <div role="alert" className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>}
        </div>
      </DialogShell>
      <ConfirmDialog open={deleteOpen} title={`Delete relay "${relay?.name || ''}"?`} message="The relay route and its machines will disappear from this panel. The remote relay itself is not deleted." confirmLabel={busy ? 'Deleting…' : 'Delete relay'} confirmTone="danger" busy={busy} onConfirm={() => void remove()} onClose={() => { setDeleteOpen(false); if (confirmDeleteOnOpen) onClose(); }} />
    </>
  );
}
