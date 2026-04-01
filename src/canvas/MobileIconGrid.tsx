import { Plus } from 'lucide-react';
import { useCanvasStore } from '../stores/canvasStore';
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

  const handleTap = (item: CanvasItem) => {
    if (item.type === 'anchor') return;
    openWindow(item.id);
    onOpenItem(item.id);
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
          <button
            key={item.id}
            onClick={() => handleTap(item)}
            className="flex flex-col items-center justify-center rounded-xl select-none active:opacity-70"
            style={{
              width: CELL,
              height: CELL + 16,
              background: item.window?.isOpen
                ? 'var(--canvas-accent-bg, rgba(212,165,116,0.1))'
                : 'var(--canvas-surface, #1a1b14)',
            }}
          >
            <ItemIcon item={item} size={24} />
            <span
              className="truncate text-center font-semibold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] mt-1"
              style={{ maxWidth: CELL - 8, fontSize: 10 }}
            >
              {getCanvasItemTitle(item)}
            </span>
          </button>
        ))}

        {/* Add button */}
        <button
          className="flex items-center justify-center rounded-xl"
          style={{
            width: CELL,
            height: CELL + 16,
            border: '1px dashed var(--canvas-border, #3b3a32)',
          }}
        >
          <Plus size={20} style={{ color: 'var(--canvas-muted, #75715e)' }} />
        </button>
      </div>
    </div>
  );
}
