import { useState, useRef, useCallback } from 'react';
import { Plus, X, Pencil, Trash2 } from 'lucide-react';
import { useCanvasStore } from '../stores/canvasStore';
import { useAgentStore } from '../stores/agentStore';
import { CREATE_ITEMS, createCanvasItemAtPosition } from '../components/createItems';
import ItemIcon from '../components/ItemIcon';
import { getCanvasItemTitle } from '../utils/canvasItemTitle';
import type { CanvasItem } from '../types';

const COLS = 5;
const CELL = 72;
const GAP = 6;
const LONG_PRESS_MS = 500;

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

  // Long press tracking
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const handlePointerDown = useCallback((item: CanvasItem, e: React.PointerEvent) => {
    longPressTriggered.current = false;
    const x = e.clientX;
    const y = e.clientY;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setContextMenu({ itemId: item.id, x, y });
    }, LONG_PRESS_MS);
  }, []);

  const handlePointerUp = useCallback((item: CanvasItem) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!longPressTriggered.current) {
      // Normal tap
      if (item.type === 'anchor') return;
      openWindow(item.id);
      window.dispatchEvent(new CustomEvent('mobile-open-tab', { detail: { itemId: item.id } }));
      onOpenItem(item.id);
    }
  }, [openWindow, onOpenItem]);

  const handlePointerCancel = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

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

  return (
    <div className="flex-1 overflow-y-auto p-3" style={{ paddingBottom: 48 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLS}, ${CELL}px)`,
          gap: GAP,
          justifyContent: 'center',
        }}
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="flex flex-col items-center justify-center rounded-xl select-none active:opacity-70 touch-none"
            style={{
              width: CELL,
              height: CELL + 16,
              background: item.window?.isOpen
                ? 'var(--canvas-accent-bg, rgba(212,165,116,0.1))'
                : 'var(--canvas-surface, #1a1b14)',
            }}
            onPointerDown={(e) => handlePointerDown(item, e)}
            onPointerUp={() => handlePointerUp(item)}
            onPointerCancel={handlePointerCancel}
            onPointerLeave={handlePointerCancel}
            onContextMenu={(e) => e.preventDefault()}
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
        ))}

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
      </div>

      {/* Context menu — long press */}
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

      {/* Create panel — bottom sheet */}
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
              {CREATE_ITEMS.map(({ type, label, icon: Icon }) => (
                <button
                  key={type}
                  onClick={() => handleCreate(type)}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-canvas-border active:opacity-70"
                >
                  <Icon size={28} className="text-canvas-accent" />
                  <span className="text-[11px] text-canvas-text">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
