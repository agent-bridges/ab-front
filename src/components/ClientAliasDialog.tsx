import { useEffect, useRef, useState } from 'react';

export default function ClientAliasDialog({
  open,
  kind,
  realName,
  immutableId,
  alias,
  onSave,
  onClose,
}: {
  open: boolean;
  kind: 'daemon' | 'PTY instance';
  realName: string;
  immutableId: string;
  alias: string;
  onSave: (alias: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(alias);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(alias);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [alias, open]);

  if (!open) return null;
  const save = () => { onSave(draft.trim()); onClose(); };

  return (
    <div className="fixed inset-0 z-[100300] flex items-center justify-center bg-black/60 px-4" onMouseDown={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-canvas-border bg-canvas-surface p-4 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <div className="text-sm font-semibold text-canvas-text">Local label for {kind}</div>
        <div className="mt-3 rounded-lg border border-canvas-border bg-canvas-bg px-3 py-2 text-xs">
          <div className="text-canvas-muted">Real name</div>
          <div className="mt-0.5 break-words font-medium text-canvas-text">{realName}</div>
          <div className="mt-2 text-canvas-muted">Immutable ID</div>
          <div className="mt-0.5 break-all font-mono text-[10px] text-canvas-text">{immutableId}</div>
        </div>
        <label className="mt-3 block text-xs text-canvas-muted">Local label</label>
        <input ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') save(); if (event.key === 'Escape') onClose(); }}
          placeholder={realName}
          className="mt-1 w-full rounded border border-canvas-border bg-canvas-bg px-3 py-2 text-xs text-canvas-text outline-none focus:border-canvas-accent" />
        <div className="mt-1 text-[10px] text-canvas-muted">Stored only in this client. Leave empty to use the real name.</div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-canvas-border px-3 py-1.5 text-xs">Cancel</button>
          <button onClick={save} className="rounded border border-canvas-accent bg-canvas-accent/20 px-3 py-1.5 text-xs font-semibold text-canvas-accent">Save</button>
        </div>
      </div>
    </div>
  );
}
