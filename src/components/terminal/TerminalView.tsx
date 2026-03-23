import { useRef, useState } from 'react';
import { useTerminal } from '../../hooks/useTerminal';
import type { CanvasItem } from '../../types';

export default function TerminalView({ item }: { item: CanvasItem }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  useTerminal(item, wrapperRef, setError);

  return (
    <div
      ref={wrapperRef}
      className="w-full h-full relative"
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
