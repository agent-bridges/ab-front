import type { ReactNode } from 'react';

interface DialogShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  widthClassName?: string;
  bodyClassName?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export default function DialogShell({
  open,
  onClose,
  title,
  description,
  widthClassName = 'max-w-lg',
  bodyClassName = '',
  children,
  footer,
}: DialogShellProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100100] flex items-center justify-center bg-black/50 px-4" data-canvas-interactive="true">
      <div className={`w-full ${widthClassName} rounded-xl border border-canvas-border bg-canvas-surface shadow-2xl`}>
        <div className="flex items-center justify-between gap-3 border-b border-canvas-border px-5 py-4">
          <div>
            <div className="text-base font-semibold text-canvas-text">{title}</div>
            {description && <div className="text-xs text-canvas-muted">{description}</div>}
          </div>
          <button
            className="rounded-md border border-canvas-border px-3 py-1.5 text-xs text-canvas-text hover:bg-canvas-border"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <div className={`px-5 py-4 ${bodyClassName}`.trim()}>{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-canvas-border px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}
