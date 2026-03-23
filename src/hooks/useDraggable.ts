import { useCallback, useRef } from 'react';
import { useCanvasStore } from '../stores/canvasStore';

export function useDraggable(itemId: string, onTap?: () => void) {
  const isDragging = useRef(false);
  const startMouse = useRef({ x: 0, y: 0 });
  const dragIds = useRef<string[]>([]);
  const startPositions = useRef<Record<string, { x: number; y: number }>>({});
  const didMove = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) {
      isDragging.current = false;
      didMove.current = false;
      return;
    }

    e.stopPropagation();
    isDragging.current = true;
    didMove.current = false;
    startMouse.current = { x: e.clientX, y: e.clientY };
    const state = useCanvasStore.getState();
    const selected = state.selectedItemIds.includes(itemId) ? state.selectedItemIds : [itemId];
    dragIds.current = selected;
    state.startDraggingItems(selected);
    startPositions.current = Object.fromEntries(
      state.items
        .filter((item) => selected.includes(item.id))
        .map((item) => [item.id, { x: item.x, y: item.y }]),
    );
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [itemId]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    if (!isDragging.current) return;
    const zoom = useCanvasStore.getState().zoom;
    const dx = (e.clientX - startMouse.current.x) / zoom;
    const dy = (e.clientY - startMouse.current.y) / zoom;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didMove.current = true;
    const nextPositions = Object.fromEntries(
      dragIds.current.map((id) => {
        const start = startPositions.current[id];
        return [id, { x: start.x + dx, y: start.y + dy }];
      }),
    );
    useCanvasStore.getState().moveItems(nextPositions);
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    const wasDragging = isDragging.current;
    const draggedCount = dragIds.current.length;
    isDragging.current = false;
    useCanvasStore.getState().stopDraggingItems();
    dragIds.current = [];
    if (e.button !== 0 || !wasDragging) return;
    if (!didMove.current && draggedCount === 1 && onTap) onTap();
  }, [onTap]);

  return { onPointerDown, onPointerMove, onPointerUp, didMove };
}
