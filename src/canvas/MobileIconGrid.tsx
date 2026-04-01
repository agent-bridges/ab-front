import { useState, useCallback, useEffect, useRef } from 'react';
import { Plus, X, Pencil, Trash2, Minus } from 'lucide-react';
import { useCanvasStore } from '../stores/canvasStore';
import { useAgentStore } from '../stores/agentStore';
import { CREATE_ITEMS, createCanvasItemAtPosition } from '../components/createItems';
import ItemIcon from '../components/ItemIcon';
import { getCanvasItemTitle } from '../utils/canvasItemTitle';
import type { CanvasItem } from '../types';

const COLS = 5;
const CELL = 72;
const GAP = 6;

interface Props {
  onOpenItem: (id: string) => void;
}

export default function MobileIconGrid({ onOpenItem }: Props) {
  const items = useCanvasStore((s) => s.items);
  const openWindow = useCanvasStore((s) => s.openWindow);
  const removeItem = useCanvasStore((s) => s.removeItem);
  const updateItem = useCanvasStore((s) => s.updateItem);
  const addItem = useCanvasStore((s) => s.addItem);
  const currentAgentId = useAgentStore((s) => s.currentAgentId);
  const [showCreate, setShowCreate] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ itemId: string; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [dragMode, setDragMode] = useState(false);

  // Drag state
  const [order, setOrder] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragPos, setDragPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const gridRef = useRef<HTMLDivElement>(null);

  // Sync order with items
  useEffect(() => {
    setOrder((prev) => {
      const ids = items.map((i) => i.id);
      // Keep existing order, add new items at end, remove deleted
      const kept = prev.filter((id) => ids.includes(id));
      const newIds = ids.filter((id) => !kept.includes(id));
      return [...kept, ...newIds];
    });
  }, [items]);

  // Listen for drag mode toggle from Toolbar
  useEffect(() => {
    const handler = (e: Event) => {
      setDragMode((e as CustomEvent).detail?.enabled ?? false);
      setDraggingId(null);
    };
    window.addEventListener('mobile-drag-mode', handler);
    return () => window.removeEventListener('mobile-drag-mode', handler);
  }, []);

  const orderedItems = order.map((id) => items.find((i) => i.id === id)).filter(Boolean) as CanvasItem[];

  const handleTap = useCallback((item: CanvasItem) => {
    if (item.type === 'anchor') return;
    openWindow(item.id);
    window.dispatchEvent(new CustomEvent('mobile-open-tab', { detail: { itemId: item.id } }));
    onOpenItem(item.id);
  }, [openWindow, onOpenItem]);

  const handleDelete = useCallback((itemId: string) => {
    removeItem(itemId);
    setContextMenu(null);
  }, [removeItem]);

  const handleRename = useCallback((itemId: string) => {
    const item = items.find(i => i.id === itemId);
    setRenameValue(getCanvasItemTitle(item!));
    setRenaming(itemId);
    setContextMenu(null);
  }, [items]);

  const commitRename = useCallback(() => {
    if (renaming && renameValue.trim()) {
      updateItem(renaming, { label: renameValue.trim() });
    }
    setRenaming(null);
  }, [renaming, renameValue, updateItem]);

  const handleCreate = async (type: string) => {
    setShowCreate(false);
    await createCanvasItemAtPosition({
      type: type as any,
      x: 0,
      y: 0,
      agentId: currentAgentId,
      addItem,
    });
  };

  // Drag handlers
  const getDropIndex = useCallback((clientX: number, clientY: number): number => {
    if (!gridRef.current) return -1;
    const rect = gridRef.current.getBoundingClientRect();
    const cellW = CELL + GAP;
    const cellH = CELL + 16 + GAP;
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;
    if (relX < 0 || relY < 0) return 0;
    const col = Math.min(Math.floor(relX / cellW), COLS - 1);
    const row = Math.floor(relY / cellH);
    const idx = row * COLS + col;
    return Math.max(0, Math.min(idx, orderedItems.length - 1));
  }, [orderedItems.length]);

  const handleDragStart = (itemId: string, e: React.PointerEvent) => {
    if (!dragMode) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    const elRect = el.getBoundingClientRect();
    setDraggingId(itemId);
    setDragOffset({ x: e.clientX - elRect.left, y: e.clientY - elRect.top });
    setDragPos({ x: e.clientX, y: e.clientY });
  };

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
  }, []);

  // Global pointer events for drag — so dragging works outside grid
  useEffect(() => {
    if (!draggingId) return;
    const onMove = (e: PointerEvent) => {
      setDragPos({ x: e.clientX, y: e.clientY });
      const dropIdx = getDropIndex(e.clientX, e.clientY);
      if (dropIdx < 0) return;
      setOrder((prev) => {
        const dragIdx = prev.indexOf(draggingId);
        if (dragIdx === dropIdx || dragIdx < 0) return prev;
        const next = [...prev];
        next.splice(dragIdx, 1);
        next.splice(dropIdx, 0, draggingId);
        return next;
      });
    };
    const onUp = () => setDraggingId(null);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  }, [draggingId]);

  return (
    <div
      className="flex-1 overflow-y-auto p-3"
      style={{ paddingBottom: 48, touchAction: dragMode ? 'none' : undefined, minHeight: 0 }}
    >
      <div
        ref={gridRef}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLS}, ${CELL}px)`,
          gap: GAP,
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {orderedItems.map((item) => {
          const isDragging = draggingId === item.id;

          // Anchor → full-width splitter/separator
          if (item.type === 'anchor') {
            return (
              <div
                key={item.id}
                className={`flex items-center gap-2 rounded-lg select-none ${isDragging ? 'opacity-30' : ''}`}
                style={{
                  gridColumn: `1 / -1`,
                  height: 28,
                  padding: '0 8px',
                  background: 'var(--canvas-border, #3b3a32)',
                  animation: dragMode && !isDragging ? `wiggle 0.3s ease-in-out infinite alternate` : undefined,
                }}
                onPointerDown={(e) => handleDragStart(item.id, e)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!dragMode) setContextMenu({ itemId: item.id, x: e.clientX, y: e.clientY });
                }}
              >
                <div className="flex-1 h-px bg-canvas-muted/30" />
                {renaming === item.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                    className="bg-canvas-bg border border-canvas-accent rounded px-2 text-canvas-text outline-none text-center"
                    style={{ fontSize: 11, maxWidth: 160 }}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="text-xs text-canvas-accent font-semibold uppercase tracking-wider px-2">
                    {getCanvasItemTitle(item)}
                  </span>
                )}
                <div className="flex-1 h-px bg-canvas-muted/30" />
              </div>
            );
          }

          // Regular icon
          return (
            <div
              key={item.id}
              className={`flex flex-col items-center justify-center rounded-xl select-none ${
                dragMode ? 'cursor-grab' : 'active:opacity-70'
              } ${isDragging ? 'opacity-30' : ''}`}
              style={{
                width: CELL,
                height: CELL + 16,
                background: item.window?.isOpen
                  ? 'var(--canvas-accent-bg, rgba(212,165,116,0.1))'
                  : 'var(--canvas-surface, #1a1b14)',
                animation: dragMode && !isDragging ? `wiggle 0.3s ease-in-out infinite alternate` : undefined,
                transition: draggingId && !isDragging ? 'transform 0.15s ease' : undefined,
              }}
              onClick={() => {
                if (dragMode) return;
                handleTap(item);
              }}
              onPointerDown={(e) => handleDragStart(item.id, e)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!dragMode) setContextMenu({ itemId: item.id, x: e.clientX, y: e.clientY });
              }}
            >
              <ItemIcon item={item} size={24} />
              {renaming === item.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                  className="w-full text-center bg-canvas-bg border border-canvas-accent rounded px-1 mt-1 text-canvas-text outline-none"
                  style={{ fontSize: 10, maxWidth: CELL - 8 }}
                  onPointerDown={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className="truncate text-center font-semibold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] mt-1"
                  style={{ maxWidth: CELL - 8, fontSize: 10 }}
                >
                  {getCanvasItemTitle(item)}
                </span>
              )}
            </div>
          );
        })}

        {/* Add button */}
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center justify-center rounded-xl active:opacity-70"
          style={{
            width: CELL,
            height: CELL + 16,
            border: '1px dashed var(--canvas-border, #3b3a32)',
          }}
        >
          <Plus size={20} style={{ color: 'var(--canvas-muted, #75715e)' }} />
        </button>

        {/* Floating drag ghost */}
        {draggingId && (() => {
          const item = items.find((i) => i.id === draggingId);
          if (!item) return null;
          return (
            <div
              className="fixed pointer-events-none z-[100] flex flex-col items-center justify-center rounded-xl shadow-2xl"
              style={{
                width: CELL,
                height: CELL + 16,
                left: dragPos.x - dragOffset.x,
                top: dragPos.y - dragOffset.y,
                background: 'var(--canvas-surface, #1a1b14)',
                border: '2px solid var(--canvas-accent, #d4a574)',
                opacity: 0.9,
              }}
            >
              <ItemIcon item={item} size={24} />
              <span
                className="truncate text-center font-semibold leading-tight text-white mt-1"
                style={{ maxWidth: CELL - 8, fontSize: 10 }}
              >
                {getCanvasItemTitle(item)}
              </span>
            </div>
          );
        })()}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setContextMenu(null)} />
          <div
            className="fixed bg-canvas-surface border border-canvas-border rounded-lg shadow-xl py-1 z-[81] min-w-[140px]"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 160),
              top: Math.min(contextMenu.y, window.innerHeight - 100),
            }}
          >
            <button
              onClick={() => handleRename(contextMenu.itemId)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-canvas-text hover:bg-canvas-border"
            >
              <Pencil size={14} className="text-canvas-muted" />
              Rename
            </button>
            <div className="border-t border-canvas-border my-0.5" />
            <button
              onClick={() => handleDelete(contextMenu.itemId)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/20"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        </>
      )}

      {/* Create panel */}
      {showCreate && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[80]" onClick={() => setShowCreate(false)} />
          <div className="fixed bottom-0 left-0 right-0 bg-canvas-surface border-t border-canvas-border rounded-t-2xl z-[81] p-4 pb-8">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-canvas-text">Create</span>
              <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-canvas-border rounded">
                <X size={16} className="text-canvas-muted" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {CREATE_ITEMS.map(({ type, label, icon: Icon }) => {
                const displayLabel = type === 'anchor' ? 'Splitter' : label;
                const DisplayIcon = type === 'anchor' ? Minus : Icon;
                return (
                  <button
                    key={type}
                    onClick={() => handleCreate(type)}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-canvas-border active:opacity-70"
                  >
                    <DisplayIcon size={28} className="text-canvas-accent" />
                    <span className="text-[11px] text-canvas-text">{displayLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
