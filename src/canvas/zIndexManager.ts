import type { CanvasItem, WindowState } from '../types';

export const BOARD_Z = {
  windows: 20000,
  draggingWindows: 30000,
  icons: 50000,
  minimap: 60000,
  viewportPinnedGrid: 69999,
  viewportPinnedItems: 70000,
  draggingIcons: 80000,
  contextMenuBackdrop: 90000,
  contextMenu: 90001,
  rulers: 100060,
  rulerHandles: 100061,
} as const;

function getItemOrder(item: CanvasItem) {
  if (item.type === 'anchor') return item.anchorZ ?? 0;
  if (item.window) return item.window.zIndex;
  return 0;
}

export function getCanvasItemZIndex(
  item: CanvasItem,
  options: {
    viewportPinned?: boolean;
    isFocusedAnchor?: boolean;
    isDragging?: boolean;
  } = {},
) {
  const order = getItemOrder(item);

  if (options.viewportPinned) {
    return BOARD_Z.viewportPinnedItems + order;
  }

  if (item.type === 'anchor') {
    if (options.isDragging) {
      return BOARD_Z.draggingWindows + order;
    }

    if (options.isFocusedAnchor) {
      return BOARD_Z.draggingWindows + order;
    }

    return BOARD_Z.windows + order;
  }

  if (options.isDragging) {
    return BOARD_Z.draggingIcons + order;
  }

  return BOARD_Z.icons + order;
}

export function getWindowZIndex(
  windowState: WindowState,
  options: {
    isDragging?: boolean;
  } = {},
) {
  if (options.isDragging) {
    return BOARD_Z.draggingWindows + windowState.zIndex;
  }

  return BOARD_Z.windows + windowState.zIndex;
}
