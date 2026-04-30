import { useEffect, useRef, useState } from 'react';
import { useTerminal } from '../../hooks/useTerminal';
import { useKeyboardStore } from '../../stores/keyboardStore';
import type { CanvasItem } from '../../types';

export default function TerminalView({ item }: { item: CanvasItem }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  useTerminal(item, wrapperRef, setError);

  // Register this terminal as the floating-keyboard target whenever the user
  // interacts with it. xterm puts the real input on a hidden textarea, so we
  // listen to bubbled `focusin` (and pointerdown for touch — first tap may
  // not focus the textarea immediately on iOS). On unmount, clear so the
  // keyboard doesn't dangle pointing at a dead terminal.
  useEffect(() => {
    if (!item.ptyId) return;
    const node = wrapperRef.current;
    if (!node) return;
    const setActive = useKeyboardStore.getState().setActivePtyId;
    const grab = () => setActive(item.ptyId!);
    node.addEventListener('focusin', grab);
    node.addEventListener('pointerdown', grab);
    return () => {
      node.removeEventListener('focusin', grab);
      node.removeEventListener('pointerdown', grab);
      if (useKeyboardStore.getState().activePtyId === item.ptyId) {
        setActive(null);
      }
    };
  }, [item.ptyId]);

  return (
    <div
      ref={wrapperRef}
      className="w-full h-full relative overscroll-contain"
      style={{ background: '#06060a', padding: 4 }}
    >
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#06060a] z-10">
          <div className="text-center px-4">
            <p className="text-red-400 text-sm mb-2">Failed to create terminal</p>
            <p className="text-canvas-muted text-xs">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
