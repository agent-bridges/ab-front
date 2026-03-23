import { createPortal } from 'react-dom';
import { useMemo } from 'react';
import { useAgentStore } from '../stores/agentStore';
import { useCanvasStore } from '../stores/canvasStore';
import { CREATE_ITEMS, createCanvasItemAtPosition } from '../components/createItems';
import { BOARD_Z } from './zIndexManager';

interface Props {
  x: number;
  y: number;
  canvasX: number;
  canvasY: number;
  onClose: () => void;
}

export default function ContextMenu({ x, y, canvasX, canvasY, onClose }: Props) {
  const addItem = useCanvasStore((s) => s.addItem);
  const currentAgentId = useAgentStore((s) => s.currentAgentId);
  const menuPosition = useMemo(() => {
    if (typeof window === 'undefined') {
      return { left: x, top: y };
    }

    const estimatedHeight = CREATE_ITEMS.length * 40 + 8;
    const estimatedWidth = 180;
    const viewportPad = 12;

    const left = Math.max(
      viewportPad,
      Math.min(x, window.innerWidth - estimatedWidth - viewportPad),
    );
    const top = y + estimatedHeight > window.innerHeight - viewportPad
      ? Math.max(viewportPad, y - estimatedHeight)
      : y;

    return { left, top };
  }, [x, y]);

  const handleAdd = async (type: (typeof CREATE_ITEMS)[number]['type']) => {
    await createCanvasItemAtPosition({
      type,
      x: canvasX,
      y: canvasY,
      agentId: currentAgentId,
      addItem,
    });
    onClose();
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0"
        style={{ zIndex: BOARD_Z.contextMenuBackdrop }}
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="fixed bg-canvas-surface border border-canvas-border rounded-lg shadow-xl py-1 min-w-[180px]"
        style={{ ...menuPosition, zIndex: BOARD_Z.contextMenu }}
      >
        {CREATE_ITEMS.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-canvas-text hover:bg-canvas-border/50 transition-colors"
            onClick={() => void handleAdd(type)}
          >
            <Icon size={16} className="text-canvas-accent" />
            {`New ${label}`}
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}
