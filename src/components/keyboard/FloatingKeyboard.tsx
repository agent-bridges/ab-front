import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight, GripVertical,
} from 'lucide-react';
import { useKeyboardStore } from '../../stores/keyboardStore';
import { applyKey } from './sendKey';

/**
 * On-screen modifier/arrow keys for touch devices. Drag handle on the left
 * (mouse + touch). Sticky modifiers (Ctrl/Alt/Shift) auto-release after the
 * next non-modifier press. Hidden by default; toggled in Settings.
 */
export default function FloatingKeyboard() {
  const k = useKeyboardStore((s) => s.keyboard);
  const setPos = useKeyboardStore((s) => s.setKeyboardPosition);
  const activePtyId = useKeyboardStore((s) => s.activePtyId);

  // Sticky modifier state — local, not persisted. Latched on tap, released
  // after the next non-modifier key.
  const [ctrl, setCtrl] = useState(false);
  const [alt, setAlt] = useState(false);
  const [shift, setShift] = useState(false);

  // Drag state. Position is stored as % of viewport so it survives resize.
  const dragRef = useRef<{ startX: number; startY: number; startPxX: number; startPxY: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const pxFromPct = useCallback(() => ({
    x: Math.max(0, Math.min(window.innerWidth - 60, (k.positionX / 100) * window.innerWidth)),
    y: Math.max(0, Math.min(window.innerHeight - 60, (k.positionY / 100) * window.innerHeight)),
  }), [k.positionX, k.positionY]);

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

  // Send a key. Modifiers are toggle buttons (no input emitted). Anything
  // else fires applyKey() with current modifier state, then releases sticky
  // modifiers.
  const press = (key: 'Control' | 'Alt' | 'Shift' | string) => {
    if (key === 'Control') { setCtrl((v) => !v); return; }
    if (key === 'Alt')     { setAlt((v) => !v);  return; }
    if (key === 'Shift')   { setShift((v) => !v); return; }
    applyKey(activePtyId, key, { ctrlPressed: ctrl, altPressed: alt, shiftPressed: shift });
    if (ctrl) setCtrl(false);
    if (alt) setAlt(false);
    if (shift) setShift(false);
  };

  // Re-render on resize so % → px stays correct.
  const [, force] = useState(0);
  useEffect(() => {
    const onResize = () => force((n) => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!k.visible) return null;

  const { x, y } = pxFromPct();
  const sz = k.iconSize;
  const btnSide = sz + 14;
  const baseBtn = 'rounded border flex items-center justify-center select-none cursor-pointer transition-colors';
  const idle = 'bg-canvas-surface border-canvas-border text-canvas-text active:bg-canvas-accent/20 active:border-canvas-accent';
  const latched = 'bg-canvas-accent/25 border-canvas-accent text-canvas-accent';

  const showRow1 = k.buttons.arrowKeys;
  const showRow2 = k.buttons.tab || k.buttons.enter || k.buttons.esc;
  const showRow3 = k.buttons.ctrl || k.buttons.alt || k.buttons.shift || k.buttons.del;

  return (
    <div
      className={`fixed z-[60] ${isDragging ? 'opacity-60' : ''}`}
      style={{ left: x, top: y, opacity: k.opacity / 100 }}
    >
      <div className="flex gap-1 bg-canvas-surface/95 backdrop-blur border border-canvas-border rounded-lg p-1 shadow-lg">
        {/* Drag handle */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="flex items-center justify-center cursor-grab active:cursor-grabbing text-canvas-muted hover:text-canvas-text px-1"
          style={{ touchAction: 'none' }}
          title="Drag to move"
        >
          <GripVertical size={sz} />
        </div>

        <div className="flex flex-col gap-1">
          {/* Active-PTY indicator. Useful in multi-terminal AB so users see
              what they're sending to. */}
          {activePtyId ? (
            <div className="text-[9px] text-canvas-muted px-1 truncate max-w-[180px]" title={`PTY ${activePtyId}`}>
              → {activePtyId.replace(/^pty_/, '').slice(0, 14)}
            </div>
          ) : (
            <div className="text-[9px] text-red-400/70 px-1">no terminal focused</div>
          )}

          {showRow1 && (
            <div className="flex gap-1">
              <button onClick={() => press('ArrowUp')}
                className={`${baseBtn} ${idle}`}
                style={{ width: btnSide, height: btnSide }}>
                <ArrowUp size={sz - 2} />
              </button>
              <button onClick={() => press('ArrowDown')}
                className={`${baseBtn} ${idle}`}
                style={{ width: btnSide, height: btnSide }}>
                <ArrowDown size={sz - 2} />
              </button>
              <button onClick={() => press('ArrowLeft')}
                className={`${baseBtn} ${idle}`}
                style={{ width: btnSide, height: btnSide }}>
                <ArrowLeft size={sz - 2} />
              </button>
              <button onClick={() => press('ArrowRight')}
                className={`${baseBtn} ${idle}`}
                style={{ width: btnSide, height: btnSide }}>
                <ArrowRight size={sz - 2} />
              </button>
            </div>
          )}

          {showRow2 && (
            <div className="flex gap-1">
              {k.buttons.tab && <KeyButton label="Tab" onClick={() => press('Tab')} sz={sz} />}
              {k.buttons.enter && <KeyButton label="Enter" onClick={() => press('Enter')} sz={sz} />}
              {k.buttons.esc && <KeyButton label="Esc" onClick={() => press('Escape')} sz={sz} />}
            </div>
          )}

          {showRow3 && (
            <div className="flex gap-1">
              {k.buttons.ctrl && (
                <button onClick={() => press('Control')}
                  className={`${baseBtn} ${ctrl ? latched : idle}`}
                  style={{ height: btnSide, paddingLeft: 8, paddingRight: 8, fontSize: sz - 4 }}>
                  Ctrl
                </button>
              )}
              {k.buttons.alt && (
                <button onClick={() => press('Alt')}
                  className={`${baseBtn} ${alt ? latched : idle}`}
                  style={{ height: btnSide, paddingLeft: 8, paddingRight: 8, fontSize: sz - 4 }}>
                  Alt
                </button>
              )}
              {k.buttons.shift && (
                <button onClick={() => press('Shift')}
                  className={`${baseBtn} ${shift ? latched : idle}`}
                  style={{ height: btnSide, paddingLeft: 8, paddingRight: 8, fontSize: sz - 4 }}>
                  Shift
                </button>
              )}
              {k.buttons.del && <KeyButton label="Del" onClick={() => press('Delete')} sz={sz} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KeyButton({ label, onClick, sz }: { label: string; onClick: () => void; sz: number }) {
  return (
    <button
      onClick={onClick}
      className="rounded border bg-canvas-surface border-canvas-border text-canvas-text active:bg-canvas-accent/20 active:border-canvas-accent flex items-center justify-center select-none cursor-pointer transition-colors"
      style={{ height: sz + 14, paddingLeft: 8, paddingRight: 8, fontSize: sz - 4 }}
    >
      {label}
    </button>
  );
}
