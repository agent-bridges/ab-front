import { useCallback, useRef, useEffect } from 'react';
import { useCanvasStore } from '../stores/canvasStore';
import { useIsMobile } from './useIsMobile';

export function usePanZoom() {
  const { panX, panY, zoom, setPan, setZoom, clearSelectedItems } = useCanvasStore();
  const isMobile = useIsMobile();
  const isPanning = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLElement | null>(null);
  const startScroll = useRef({ left: 0, top: 0 });
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-canvas-interactive="true"]')) return;
    if (!target.closest('[data-canvas="bg"]')) return;
    if (e.button !== 0) return;
    if (!e.shiftKey && !e.metaKey && !e.ctrlKey) clearSelectedItems();
    isPanning.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (isMobile) {
      return;
    }

    if (canvasRef.current) {
      startScroll.current = {
        left: canvasRef.current.scrollLeft,
        top: canvasRef.current.scrollTop,
      };
    }
  }, [clearSelectedItems, isMobile]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return;
    if (isMobile) {
      const dx = e.clientX - lastPos.current.x;
      const dy = e.clientY - lastPos.current.y;
      lastPos.current = { x: e.clientX, y: e.clientY };
      const state = useCanvasStore.getState();
      setPan(state.panX + dx, state.panY + dy);
      return;
    }

    const el = canvasRef.current;
    if (!el) return;
    el.scrollLeft = startScroll.current.left - (e.clientX - lastPos.current.x);
    el.scrollTop = startScroll.current.top - (e.clientY - lastPos.current.y);
    setPan(el.scrollLeft, el.scrollTop);
  }, [isMobile, setPan]);

  const onPointerUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  // Attach wheel with { passive: false } to allow preventDefault
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-canvas-interactive="true"]')) {
        return;
      }

      if (!e.shiftKey) {
        return;
      }

      e.preventDefault();
      const state = useCanvasStore.getState();
      const delta = -e.deltaY * 0.001;
      const newZoom = Math.max(0.1, Math.min(3.0, state.zoom + delta));

      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      if (isMobile) {
        const scale = newZoom / state.zoom;
        setPan(cx - scale * (cx - state.panX), cy - scale * (cy - state.panY));
      } else {
        const worldX = (el.scrollLeft + cx) / state.zoom;
        const worldY = (el.scrollTop + cy) / state.zoom;
        requestAnimationFrame(() => {
          el.scrollLeft = worldX * newZoom - cx;
          el.scrollTop = worldY * newZoom - cy;
          setPan(el.scrollLeft, el.scrollTop);
        });
      }
      setZoom(newZoom);
    };

    const handleScroll = () => {
      if (!isMobile) {
        setPan(el.scrollLeft, el.scrollTop);
      }
    };

    if (!isMobile) {
      setPan(el.scrollLeft, el.scrollTop);
      el.addEventListener('scroll', handleScroll, { passive: true });
    }
    el.addEventListener('wheel', handler, { passive: false });
    return () => {
      el.removeEventListener('wheel', handler);
      if (!isMobile) el.removeEventListener('scroll', handleScroll);
    };
  }, [isMobile, setPan, setZoom]);

  return {
    panX,
    panY,
    zoom,
    canvasRef,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
