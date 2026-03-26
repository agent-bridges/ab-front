import { useEffect, useState } from 'react';
import { Check, MapPin, Minus, Pencil, Trash2, X } from 'lucide-react';

type AnchorEntry = {
  id: string;
  title: string;
};

export default function AnchorsPanel({
  anchors,
  width,
  height,
  left,
  top,
  onSelect,
  onRename,
  onDelete,
  onMinimize,
  onTitlePointerDown,
  onTitlePointerMove,
  onTitlePointerUp,
  onResizePointerDown,
  onResizePointerMove,
  onResizePointerUp,
}: {
  anchors: AnchorEntry[];
  width: number;
  height: number;
  left: number;
  top: number;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onMinimize: () => void;
  onTitlePointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onTitlePointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onTitlePointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onResizePointerDown: (e: React.PointerEvent<HTMLDivElement>, edge: string) => void;
  onResizePointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onResizePointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [pendingDelete, setPendingDelete] = useState<AnchorEntry | null>(null);

  useEffect(() => {
    if (editingId && !anchors.some((anchor) => anchor.id === editingId)) {
      setEditingId(null);
      setEditValue('');
    }
  }, [anchors, editingId]);

  const beginEdit = (anchor: AnchorEntry) => {
    setEditingId(anchor.id);
    setEditValue(anchor.title);
  };

  const commitEdit = () => {
    if (!editingId) return;
    const next = editValue.trim();
    if (next) {
      onRename(editingId, next);
    }
    setEditingId(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    onDelete(pendingDelete.id);
    setPendingDelete(null);
  };

  return (
    <>
      <div
        className="fixed z-[61000] rounded-lg border border-canvas-border bg-canvas-surface/95 shadow-2xl backdrop-blur-sm overflow-hidden"
        data-canvas-interactive="true"
        style={{ left, top, width, height }}
      >
        <div
          className="h-8 flex items-center px-2 gap-2 shrink-0 select-none cursor-move bg-canvas-bg border-b border-canvas-border"
          onPointerDown={onTitlePointerDown}
          onPointerMove={onTitlePointerMove}
          onPointerUp={onTitlePointerUp}
        >
          <MapPin size={12} className="text-canvas-accent shrink-0" />
          <span className="text-xs font-medium text-canvas-text flex-1">Anchors</span>
          <button
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-canvas-border"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onMinimize}
            title="Minimize anchors"
          >
            <Minus size={12} className="text-canvas-muted" />
          </button>
        </div>
        <div className="absolute inset-x-0 bottom-0 top-8 overflow-y-auto overscroll-contain p-2 space-y-1">
          {anchors.length === 0 ? (
            <div className="rounded border border-dashed border-canvas-border px-3 py-4 text-xs text-canvas-muted">
              No anchors on this board
            </div>
          ) : (
            anchors.map((anchor) => (
              <div
                key={anchor.id}
                className="w-full flex items-center gap-2 rounded px-2 py-2 text-left hover:bg-canvas-border"
              >
                <MapPin size={12} className="text-canvas-accent shrink-0" />
                {editingId === anchor.id ? (
                  <>
                    <input
                      className="flex-1 min-w-0 rounded border border-canvas-accent bg-canvas-bg px-2 py-1 text-xs text-canvas-text outline-none"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitEdit();
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      className="w-7 h-7 flex items-center justify-center rounded hover:bg-canvas-accent/20 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        commitEdit();
                      }}
                      title="Save anchor name"
                    >
                      <Check size={12} className="text-canvas-accent" />
                    </button>
                    <button
                      className="w-7 h-7 flex items-center justify-center rounded hover:bg-canvas-border shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        cancelEdit();
                      }}
                      title="Cancel rename"
                    >
                      <X size={12} className="text-canvas-muted" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="flex-1 min-w-0 text-left"
                      onClick={() => onSelect(anchor.id)}
                      title="Center on anchor"
                    >
                      <span className="text-xs text-canvas-text truncate block">{anchor.title}</span>
                    </button>
                    <button
                      className="w-7 h-7 flex items-center justify-center rounded hover:bg-canvas-border shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        beginEdit(anchor);
                      }}
                      title="Rename anchor"
                    >
                      <Pencil size={12} className="text-canvas-muted" />
                    </button>
                    <button
                      className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-500/15 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDelete(anchor);
                      }}
                      title="Delete anchor"
                    >
                      <Trash2 size={12} className="text-red-400" />
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
        {[
          { edge: 'r', cls: 'top-3 bottom-3 right-0 w-2 cursor-ew-resize' },
          { edge: 'b', cls: 'left-3 right-3 bottom-0 h-2 cursor-ns-resize' },
          { edge: 'rb', cls: 'right-0 bottom-0 w-3 h-3 cursor-nwse-resize' },
          { edge: 'l', cls: 'top-3 bottom-3 left-0 w-2 cursor-ew-resize' },
          { edge: 't', cls: 'left-3 right-3 top-0 h-2 cursor-ns-resize' },
          { edge: 'lt', cls: 'left-0 top-0 w-3 h-3 cursor-nwse-resize' },
          { edge: 'rt', cls: 'right-0 top-0 w-3 h-3 cursor-nesw-resize' },
          { edge: 'lb', cls: 'left-0 bottom-0 w-3 h-3 cursor-nesw-resize' },
        ].map(({ edge, cls }) => (
          <div
            key={edge}
            className={`absolute ${cls}`}
            onPointerDown={(e) => onResizePointerDown(e, edge)}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
          />
        ))}
      </div>
      {pendingDelete && (
        <div className="fixed inset-0 z-[62000] flex items-center justify-center bg-black/50" data-canvas-interactive="true">
          <div className="w-full max-w-sm rounded-xl border border-canvas-border bg-canvas-surface shadow-2xl p-4">
            <h3 className="text-sm font-semibold text-canvas-text">Delete "{pendingDelete.title}"?</h3>
            <p className="mt-2 text-xs text-canvas-muted">
              This anchor will be removed from the board.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-md border border-canvas-border px-3 py-1.5 text-xs text-canvas-text hover:bg-canvas-border"
                onClick={() => setPendingDelete(null)}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-400"
                onClick={confirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
