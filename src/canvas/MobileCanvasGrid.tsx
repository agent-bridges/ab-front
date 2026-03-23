import { X } from 'lucide-react';
import { useCanvasStore } from '../stores/canvasStore';
import ItemIcon from '../components/ItemIcon';
import { getCanvasItemTitle } from '../utils/canvasItemTitle';

export default function MobileCanvasGrid() {
  const items = useCanvasStore((s) => s.items);
  const openWindow = useCanvasStore((s) => s.openWindow);
  const removeItem = useCanvasStore((s) => s.removeItem);

  const visibleItems = items.filter((i) => !i.window?.isOpen);

  if (visibleItems.length === 0) {
    return (
      <div className="flex-1 bg-canvas-bg flex items-center justify-center" data-canvas="bg">
        <span className="text-sm text-canvas-muted">Tap + to create</span>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-canvas-bg overflow-y-auto p-3" data-canvas="bg">
      <div className="grid grid-cols-4 gap-3">
        {visibleItems.map((item) => (
          <div
            key={item.id}
            className="relative flex flex-col items-center gap-1 p-2 rounded-lg active:bg-canvas-surface transition-colors"
            onClick={() => openWindow(item.id)}
          >
            <button
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-canvas-border hover:bg-red-500/80 flex items-center justify-center z-10"
              onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
            >
              <X size={10} className="text-canvas-text" />
            </button>
            <ItemIcon item={item} />
            <span className="max-w-[64px] truncate text-center text-[11px] font-semibold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
              {getCanvasItemTitle(item)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
