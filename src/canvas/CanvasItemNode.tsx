import { useCallback, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDraggable } from '../hooks/useDraggable';
import { useIsMobile } from '../hooks/useIsMobile';
import { useCanvasStore } from '../stores/canvasStore';
import ItemIcon from '../components/ItemIcon';
import type { CanvasItem } from '../types';
import { getCanvasItemTitle } from '../utils/canvasItemTitle';
import { BOARD_Z, getCanvasItemZIndex } from './zIndexManager';

const VIEWPORT_GRID = 80;

export default function CanvasItemNode({
  item,
  originX = 0,
  originY = 0,
  zoom = 1,
  viewportPinned = false,
  screenX = 0,
  screenY = 0,
}: {
  item: CanvasItem;
  originX?: number;
  originY?: number;
  zoom?: number;
  viewportPinned?: boolean;
  screenX?: number;
  screenY?: number;
}) {
  const canOpenWindow = item.type !== 'anchor';
  const openWindow = useCanvasStore((s) => s.openWindow);
  const selectedItemIds = useCanvasStore((s) => s.selectedItemIds);
  const focusedAnchorId = useCanvasStore((s) => s.focusedAnchorId);
  const draggingItemIds = useCanvasStore((s) => s.draggingItemIds);
  const setFocusedAnchor = useCanvasStore((s) => s.setFocusedAnchor);
  const focusAnchor = useCanvasStore((s) => s.focusAnchor);
  const startDraggingItems = useCanvasStore((s) => s.startDraggingItems);
  const stopDraggingItems = useCanvasStore((s) => s.stopDraggingItems);
  const toggleSelectedItem = useCanvasStore((s) => s.toggleSelectedItem);
  const toggleItemPinned = useCanvasStore((s) => s.toggleItemPinned);
  const movePinnedItemViewport = useCanvasStore((s) => s.movePinnedItemViewport);
  const handleTap = useCallback(() => {
    if (canOpenWindow) openWindow(item.id);
  }, [canOpenWindow, item.id, openWindow]);
  const { onPointerDown, onPointerMove, onPointerUp } = useDraggable(item.id, handleTap);
  const removeItem = useCanvasStore((s) => s.removeItem);
  const updateItem = useCanvasStore((s) => s.updateItem);
  const isMobile = useIsMobile();
  const isSelected = selectedItemIds.includes(item.id);
  const isFocusedAnchor = item.type === 'anchor' && focusedAnchorId === item.id;
  const isDragging = draggingItemIds.includes(item.id);
  const iconScale = viewportPinned ? 1 : (isMobile ? 1 : zoom);
  const iconBox = 80 * iconScale;
  const iconSize = 24 * iconScale;
  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);
  const displayTitle = getCanvasItemTitle(item);
  const menuPosition = useRef<{ left: number; top: number }>({ left: 0, top: 0 });

  // Rename
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(displayTitle);
  const inputRef = useRef<HTMLInputElement>(null);
  const pinnedDragRef = useRef<{ dragging: boolean; moved: boolean; startX: number; startY: number; left: number; top: number }>({
    dragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    left: 0,
    top: 0,
  });

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ctxMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const estimatedHeight = item.type === 'anchor' ? 104 : 140;
    const estimatedWidth = 140;
    const viewportPad = 12;
    const left = Math.max(
      viewportPad,
      Math.min(e.clientX, window.innerWidth - estimatedWidth - viewportPad),
    );
    const top = e.clientY + estimatedHeight > window.innerHeight - viewportPad
      ? Math.max(viewportPad, e.clientY - estimatedHeight)
      : e.clientY;
    menuPosition.current = { left, top };
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleRename = useCallback(() => {
    setCtxMenu(null);
    setEditValue(displayTitle);
    setEditing(true);
  }, [displayTitle]);

  const handleDelete = useCallback(() => {
    setCtxMenu(null);
    removeItem(item.id);
  }, [item.id, removeItem]);

  const handleTogglePinned = useCallback(() => {
    if (item.type === 'anchor') return;
    setCtxMenu(null);
    toggleItemPinned(item.id);
  }, [item.id, item.type, toggleItemPinned]);

  const commitLabel = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== displayTitle) {
      updateItem(item.id, { label: trimmed });
    }
    setEditing(false);
  }, [displayTitle, editValue, item.id, updateItem]);

  const handleRemove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    removeItem(item.id);
  }, [item.id, removeItem]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!isMobile) {
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        toggleSelectedItem(item.id);
        return;
      }
    }

    if (viewportPinned) {
      e.stopPropagation();
      startDraggingItems([item.id]);
      pinnedDragRef.current = {
        dragging: true,
        moved: false,
        startX: e.clientX,
        startY: e.clientY,
        left: screenX,
        top: screenY,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    if (item.type === 'anchor') {
      focusAnchor(item.id);
    } else if (focusedAnchorId) {
      setFocusedAnchor(null);
    }

    onPointerDown(e);
  }, [focusAnchor, focusedAnchorId, isMobile, item.id, item.type, onPointerDown, screenX, screenY, setFocusedAnchor, toggleSelectedItem, viewportPinned]);

  const handlePinnedPointerMove = useCallback((e: React.PointerEvent) => {
    if (!viewportPinned || !pinnedDragRef.current.dragging) return;
    e.stopPropagation();

    const root = document.querySelector<HTMLElement>('[data-canvas-root="true"]');
    const rect = root?.getBoundingClientRect();
    if (!rect) return;

    const nextLeft = pinnedDragRef.current.left + (e.clientX - pinnedDragRef.current.startX);
    const nextTop = pinnedDragRef.current.top + (e.clientY - pinnedDragRef.current.startY);
    if (Math.abs(e.clientX - pinnedDragRef.current.startX) > 3 || Math.abs(e.clientY - pinnedDragRef.current.startY) > 3) {
      pinnedDragRef.current.moved = true;
    }
    const rawViewportLeft = nextLeft - rect.left;
    const rawViewportTop = nextTop - rect.top;
    const snappedViewportLeft = Math.round(rawViewportLeft / VIEWPORT_GRID) * VIEWPORT_GRID;
    const snappedViewportTop = Math.round(rawViewportTop / VIEWPORT_GRID) * VIEWPORT_GRID;
    const clampedViewportLeft = Math.max(0, Math.min(rect.width - iconBox, snappedViewportLeft));
    const clampedViewportTop = Math.max(0, Math.min(rect.height - iconBox, snappedViewportTop));

    movePinnedItemViewport(item.id, clampedViewportLeft, clampedViewportTop);
  }, [iconBox, item.id, movePinnedItemViewport, viewportPinned]);

  const handlePinnedPointerUp = useCallback((e: React.PointerEvent) => {
    if (!viewportPinned) return;
    e.stopPropagation();
    pinnedDragRef.current.dragging = false;
    stopDraggingItems();
  }, [stopDraggingItems, viewportPinned]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!canOpenWindow) return;
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('center-canvas-window', { detail: { itemId: item.id } }));
  }, [canOpenWindow, item.id]);

  return (
    <>
      <div
        className={`absolute flex flex-col items-center justify-center gap-1 select-none cursor-grab active:cursor-grabbing group rounded-xl ${
          isSelected && !isMobile ? 'bg-canvas-accent/10 ring-1 ring-canvas-accent/70 shadow-[0_0_0_1px_rgba(212,165,116,0.12)]' : ''
        }`}
        data-canvas-interactive="true"
        style={{
          left: viewportPinned ? screenX : (originX + item.x) * iconScale,
          top: viewportPinned ? screenY : (originY + item.y) * iconScale,
          width: iconBox,
          height: iconBox,
          zIndex: getCanvasItemZIndex(item, {
            viewportPinned,
            isFocusedAnchor,
            isDragging,
          }),
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={viewportPinned ? handlePinnedPointerMove : onPointerMove}
        onPointerUp={viewportPinned ? handlePinnedPointerUp : onPointerUp}
        onClick={viewportPinned && canOpenWindow ? () => { if (!pinnedDragRef.current.moved) openWindow(item.id); } : undefined}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        <button
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-canvas-border hover:bg-red-500/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={handleRemove}
        >
          <X size={10} />
        </button>
        <ItemIcon item={item} size={iconSize} />
        {editing ? (
          <input
            ref={inputRef}
            className="text-canvas-text bg-canvas-surface border border-canvas-accent rounded px-1 text-center outline-none"
            style={{ fontSize: `${10 * iconScale}px`, width: 76 * iconScale }}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitLabel();
              if (e.key === 'Escape') setEditing(false);
            }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="truncate text-center font-semibold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]" style={{ maxWidth: 76 * iconScale, fontSize: `${11 * iconScale}px` }}>
            {displayTitle}
          </span>
        )}
      </div>

      {/* Context menu — portaled to body to escape canvas transform */}
      {ctxMenu && createPortal(
        <div
          ref={ctxRef}
          className="fixed bg-canvas-surface border border-canvas-border rounded-lg shadow-xl py-1 min-w-[140px]"
          style={{ left: menuPosition.current.left, top: menuPosition.current.top, zIndex: BOARD_Z.contextMenu }}
        >
          {canOpenWindow && (
            <>
              <button
                className="w-full px-3 py-1.5 text-xs text-canvas-text hover:bg-canvas-accent/20 text-left"
                onClick={() => { setCtxMenu(null); openWindow(item.id); }}
              >
                Open
              </button>
              <div className="border-t border-canvas-border my-1" />
            </>
          )}
          <button
            className="w-full px-3 py-1.5 text-xs text-canvas-text hover:bg-canvas-accent/20 text-left"
            onClick={handleRename}
          >
            Rename
          </button>
          {item.type !== 'anchor' && (
            <>
              <div className="border-t border-canvas-border my-1" />
              <button
                className="w-full px-3 py-1.5 text-xs text-canvas-text hover:bg-canvas-accent/20 text-left"
                onClick={handleTogglePinned}
              >
                {item.pinned ? 'Unlock' : 'Lock'}
              </button>
            </>
          )}
          <div className="border-t border-canvas-border my-1" />
          <button
            className="w-full px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20 text-left"
            onClick={handleDelete}
          >
            Delete
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
