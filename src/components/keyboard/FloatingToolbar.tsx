import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronsUp, ChevronUp, ChevronDown, ChevronsDown, GripVertical } from 'lucide-react';
import { useKeyboardStore } from '../../stores/keyboardStore';
import { scrollActiveTerminal } from './sendKey';

/**
 * Vertical floating toolbar of scroll buttons (top / pageUp / pageDown /
 * bottom). Acts directly on the active terminal's xterm instance — no PTY
 * round-trip. Drag handle on top.
 */
export default function FloatingToolbar() {
  const s = useKeyboardStore((st) => st.scroll);
  const setPos = useKeyboardStore((st) => st.setScrollPosition);
  const activePtyId = useKeyboardStore((st) => st.activePtyId);

  const dragRef = useRef<{ startX: number; startY: number; startPxX: number; startPxY: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const pxFromPct = useCallback(() => ({
    x: Math.max(0, Math.min(window.innerWidth - 60, (s.positionX / 100) * window.innerWidth)),
    y: Math.max(0, Math.min(window.innerHeight - 60, (s.positionY / 100) * window.innerHeight)),
  }), [s.positionX, s.positionY]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    setIsDragging(true);
    const { x, y } = pxFromPct();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPxX: x, startPxY: y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const nx = Math.max(0, Math.min(window.innerWidth - 60, dragRef.current.startPxX + dx));
    const ny = Math.max(0, Math.min(window.innerHeight - 60, dragRef.current.startPxY + dy));
    setPos((nx / window.innerWidth) * 100, (ny / window.innerHeight) * 100);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    setIsDragging(false);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const [, force] = useState(0);
  useEffect(() => {
    const onResize = () => force((n) => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!s.visible) return null;

  const { x, y } = pxFromPct();
  const sz = s.iconSize;
  const btnSide = sz + 16;

  const Btn = ({ icon, action, title }: { icon: typeof ChevronUp; action: 'top' | 'pageUp' | 'pageDown' | 'bottom'; title: string }) => {
    const Icon = icon;
    return (
      <button
        onClick={() => scrollActiveTerminal(activePtyId, action)}
        title={title}
        className="rounded border bg-canvas-surface border-canvas-border text-canvas-text active:bg-canvas-accent/20 active:border-canvas-accent flex items-center justify-center"
        style={{ width: btnSide, height: btnSide }}
      >
        <Icon size={sz} />
      </button>
    );
  };

  return (
    <div
      className={`fixed z-[60] ${isDragging ? 'opacity-60' : ''}`}
      style={{ left: x, top: y, opacity: s.opacity / 100 }}
    >
      <div className="flex flex-col gap-1 bg-canvas-surface/95 backdrop-blur border border-canvas-border rounded-lg p-1 shadow-lg">
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="flex items-center justify-center cursor-grab active:cursor-grabbing text-canvas-muted hover:text-canvas-text"
          style={{ height: btnSide / 1.5, touchAction: 'none' }}
          title="Drag to move"
        >
          <GripVertical size={sz} />
        </div>
        <Btn icon={ChevronsUp} action="top" title="Scroll to top" />
        <Btn icon={ChevronUp} action="pageUp" title="Page up" />
        <Btn icon={ChevronDown} action="pageDown" title="Page down" />
        <Btn icon={ChevronsDown} action="bottom" title="Scroll to bottom" />
      </div>
    </div>
  );
}
