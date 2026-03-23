import DialogShell from './DialogShell';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmTone?: 'danger' | 'default';
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmTone = 'default',
  busy = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const confirmClassName = confirmTone === 'danger'
    ? 'border-red-500/30 text-red-200 hover:bg-red-500/10'
    : 'border-canvas-border text-canvas-text hover:bg-canvas-border';

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={title}
      widthClassName="max-w-md"
      footer={(
        <>
          <button
            className="rounded-md border border-canvas-border px-3 py-2 text-xs text-canvas-text hover:bg-canvas-border disabled:opacity-50"
            onClick={onClose}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            className={`rounded-md border px-3 py-2 text-xs disabled:opacity-50 ${confirmClassName}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {confirmLabel}
          </button>
        </>
      )}
    >
      <div className="text-sm text-canvas-text">{message}</div>
    </DialogShell>
  );
}
