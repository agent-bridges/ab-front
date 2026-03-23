import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Minus } from 'lucide-react';
import { useCanvasStore } from '../stores/canvasStore';
import { usePanZoom } from '../hooks/usePanZoom';
import { useIsMobile } from '../hooks/useIsMobile';
import { getTerminalStatusMeta, PROCESS_STATUS_THEME } from '../components/ProcessIndicator';
import { getCanvasItemTitle } from '../utils/canvasItemTitle';
import AnchorsPanel from './AnchorsPanel';
import CanvasItemNode from './CanvasItemNode';
import ContextMenu from './ContextMenu';
import Window from './Window';
import { BOARD_Z } from './zIndexManager';
import type { CanvasItem } from '../types';

interface MenuState {
  x: number;
  y: number;
  canvasX: number;
  canvasY: number;
}

const WORLD_SIZE = 12000;
const WORLD_ORIGIN = 4000;
const GRID = 80;
const ITEM_SIZE = 80;
const MINIMAP_PAD = 64;
const MINIMAP_VIEWPORT_MARGIN = 100;
const MINIMAP_TITLE_H = 32;
const MINIMAP_EDGE_PAD = 12;
const MINIMAP_TOP_PAD = 52;
const MINIMAP_MIN_W = 160;
const MINIMAP_MIN_H = 120;

function getMinimapStatusStyle(item: CanvasItem) {
  if (item.type !== 'terminal') {
    return {
      itemClass: 'border-canvas-accent/40 bg-canvas-accent/30',
      windowClass: 'border-canvas-text/35 bg-canvas-text/10',
    };
  }

  const terminalMeta = getTerminalStatusMeta(item.ptyAlive, item.ptyProcesses, item.aiStatus);
  return {
    itemClass: PROCESS_STATUS_THEME[terminalMeta.status].minimapItemClass,
    windowClass: PROCESS_STATUS_THEME[terminalMeta.status].minimapWindowClass,
  };
}

function getRenderableBounds(items: CanvasItem[]) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const item of items) {
    if (item.pinned) {
      continue;
    }
    minX = Math.min(minX, item.x);
    minY = Math.min(minY, item.y);
    maxX = Math.max(maxX, item.x + ITEM_SIZE);
    maxY = Math.max(maxY, item.y + ITEM_SIZE);

    if (item.window?.isOpen) {
      minX = Math.min(minX, item.window.x);
      minY = Math.min(minY, item.window.y);
      maxX = Math.max(maxX, item.window.x + item.window.w);
      maxY = Math.max(maxY, item.window.y + item.window.h);
    }
  }

  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function Canvas() {
  const items = useCanvasStore((s) => s.items);
  const updateItem = useCanvasStore((s) => s.updateItem);
  const removeItem = useCanvasStore((s) => s.removeItem);
  const focusAnchor = useCanvasStore((s) => s.focusAnchor);
  const setPan = useCanvasStore((s) => s.setPan);
  const setZoom = useCanvasStore((s) => s.setZoom);
  const layoutScope = useCanvasStore((s) => s.layoutScope);
  const rulerLeft = useCanvasStore((s) => s.rulerLeft);
  const rulerRight = useCanvasStore((s) => s.rulerRight);
  const rulerTop = useCanvasStore((s) => s.rulerTop);
  const rulerBottom = useCanvasStore((s) => s.rulerBottom);
  const setRulerEdge = useCanvasStore((s) => s.setRulerEdge);
  const minimapVisible = useCanvasStore((s) => s.minimapVisible);
  const boardAgentId = useCanvasStore((s) => s.boardAgentId);
  const loaded = useCanvasStore((s) => s.loaded);
  const setMinimapVisible = useCanvasStore((s) => s.setMinimapVisible);
  const minimapWidth = useCanvasStore((s) => s.minimapWidth);
  const minimapHeight = useCanvasStore((s) => s.minimapHeight);
  const minimapX = useCanvasStore((s) => s.minimapX);
  const minimapY = useCanvasStore((s) => s.minimapY);
  const setMinimapSize = useCanvasStore((s) => s.setMinimapSize);
  const setMinimapPosition = useCanvasStore((s) => s.setMinimapPosition);
  const anchorsPanelVisible = useCanvasStore((s) => s.anchorsPanelVisible);
  const anchorsPanelWidth = useCanvasStore((s) => s.anchorsPanelWidth);
  const anchorsPanelHeight = useCanvasStore((s) => s.anchorsPanelHeight);
  const anchorsPanelX = useCanvasStore((s) => s.anchorsPanelX);
  const anchorsPanelY = useCanvasStore((s) => s.anchorsPanelY);
  const setAnchorsPanelVisible = useCanvasStore((s) => s.setAnchorsPanelVisible);
  const setAnchorsPanelSize = useCanvasStore((s) => s.setAnchorsPanelSize);
  const setAnchorsPanelPosition = useCanvasStore((s) => s.setAnchorsPanelPosition);
  const isMobile = useIsMobile();
  const { panX, panY, zoom, canvasRef, onPointerDown, onPointerMove, onPointerUp } = usePanZoom();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerVersion, setContainerVersion] = useState(0);
  const didInitScroll = useRef(false);
  const worldItems = items.filter((item) => !item.pinned || isMobile);
  const pinnedItems = !isMobile ? items.filter((item) => item.pinned) : [];
  const anchors = items
    .filter((item) => item.type === 'anchor')
    .sort((a, b) => getCanvasItemTitle(a).localeCompare(getCanvasItemTitle(b)));
  const canvasRect = containerRef.current?.getBoundingClientRect();
  const openWindows = items.filter((item) => item.window?.isOpen);
  const minimapDragRef = useRef<{
    active: boolean;
    mode: 'viewport' | 'jump';
    offsetX: number;
    offsetY: number;
  }>({ active: false, mode: 'jump', offsetX: 0, offsetY: 0 });
  const minimapResizeRef = useRef<{
    startX: number;
    startY: number;
    left: number;
    top: number;
    width: number;
    height: number;
    edge: string;
  } | null>(null);
  const minimapWindowDragRef = useRef<{ startX: number; startY: number; left: number; top: number } | null>(null);
  const anchorsPanelDragRef = useRef<{ startX: number; startY: number; left: number; top: number } | null>(null);
  const anchorsPanelResizeRef = useRef<{
    startX: number;
    startY: number;
    left: number;
    top: number;
    width: number;
    height: number;
    edge: string;
  } | null>(null);
  const rulerDragRef = useRef<{ edge: 'left' | 'right' | 'top' | 'bottom' } | null>(null);

  // Merge containerRef and canvasRef (for wheel handler)
  const setRefs = useCallback((el: HTMLDivElement | null) => {
    (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    canvasRef.current = el;
    setContainerVersion((v) => v + 1);
  }, [canvasRef]);

  useEffect(() => {
    didInitScroll.current = false;
  }, [boardAgentId]);

  useEffect(() => {
    if (isMobile || didInitScroll.current || !loaded) return;
    const el = containerRef.current;
    if (!el) return;

    if (panX !== 0 || panY !== 0) {
      el.scrollLeft = panX;
      el.scrollTop = panY;
      setPan(panX, panY);
      didInitScroll.current = true;
      return;
    }

    const bounds = getRenderableBounds(items) || { minX: 80, minY: 80, maxX: 320, maxY: 320 };
    const centerX = WORLD_ORIGIN + (bounds.minX + bounds.maxX) / 2;
    const centerY = WORLD_ORIGIN + (bounds.minY + bounds.maxY) / 2;
    el.scrollLeft = Math.max(0, centerX * zoom - el.clientWidth / 2);
    el.scrollTop = Math.max(0, centerY * zoom - el.clientHeight / 2);
    setPan(el.scrollLeft, el.scrollTop);
    didInitScroll.current = true;
  }, [isMobile, items, loaded, panX, panY, setPan, zoom]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const fitCanvas = () => {
      const bounds = getRenderableBounds(items);
      if (!bounds) return;

      const rawWidth = bounds.maxX - bounds.minX;
      const rawHeight = bounds.maxY - bounds.minY;
      const minMargin = isMobile ? 24 : 40;
      const paddedWidth = rawWidth + minMargin * 2;
      const paddedHeight = rawHeight + minMargin * 2;
      const fitsAtActualSize = paddedWidth <= el.clientWidth && paddedHeight <= el.clientHeight;
      const fitZoom = Math.min(el.clientWidth / paddedWidth, el.clientHeight / paddedHeight);
      const nextZoom = fitsAtActualSize ? 1 : Math.max(0.1, Math.min(1, fitZoom));
      const centerX = bounds.minX + rawWidth / 2;
      const centerY = bounds.minY + rawHeight / 2;

      if (isMobile) {
        setZoom(nextZoom);
        setPan(el.clientWidth / 2 - centerX * nextZoom, el.clientHeight / 2 - centerY * nextZoom);
        return;
      }

      setZoom(nextZoom);
      requestAnimationFrame(() => {
        el.scrollLeft = Math.max(0, (WORLD_ORIGIN + centerX) * nextZoom - el.clientWidth / 2);
        el.scrollTop = Math.max(0, (WORLD_ORIGIN + centerY) * nextZoom - el.clientHeight / 2);
        setPan(el.scrollLeft, el.scrollTop);
      });
    };

    window.addEventListener('fit-canvas-icons', fitCanvas);
    return () => window.removeEventListener('fit-canvas-icons', fitCanvas);
  }, [isMobile, items, setPan, setZoom]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[data-canvas-interactive="true"]')) return;
    if (!target.closest('[data-canvas="bg"]')) return;
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    const canvasX = isMobile
      ? (localX - panX) / zoom
      : (panX + localX) / zoom - WORLD_ORIGIN;
    const canvasY = isMobile
      ? (localY - panY) / zoom
      : (panY + localY) / zoom - WORLD_ORIGIN;
    setMenu({ x: e.clientX, y: e.clientY, canvasX, canvasY });
  }, [isMobile, panX, panY, zoom]);

  const minimapModel = useMemo(() => {
    if (isMobile) return null;

    const bounds = getRenderableBounds(items);
    const el = containerRef.current;
    if (!bounds || !el) return null;
    const contentWidth = minimapWidth;
    const contentHeight = Math.max(80, minimapHeight - MINIMAP_TITLE_H);

    const viewport = {
      minX: panX / zoom - WORLD_ORIGIN,
      minY: panY / zoom - WORLD_ORIGIN,
      maxX: panX / zoom - WORLD_ORIGIN + el.clientWidth / zoom,
      maxY: panY / zoom - WORLD_ORIGIN + el.clientHeight / zoom,
    };
    const viewportWidth = viewport.maxX - viewport.minX;
    const viewportHeight = viewport.maxY - viewport.minY;

    let contentMinX = bounds.minX - MINIMAP_PAD;
    let contentMinY = bounds.minY - MINIMAP_PAD;
    let contentMaxX = bounds.maxX + MINIMAP_PAD;
    let contentMaxY = bounds.maxY + MINIMAP_PAD;
    let contentW = Math.max(1, contentMaxX - contentMinX);
    let contentH = Math.max(1, contentMaxY - contentMinY);

    const minContentW = viewportWidth + MINIMAP_VIEWPORT_MARGIN * 2;
    const minContentH = viewportHeight + MINIMAP_VIEWPORT_MARGIN * 2;

    if (contentW < minContentW) {
      const centerX = (contentMinX + contentMaxX) / 2;
      contentW = minContentW;
      contentMinX = centerX - contentW / 2;
      contentMaxX = centerX + contentW / 2;
    }

    if (contentH < minContentH) {
      const centerY = (contentMinY + contentMaxY) / 2;
      contentH = minContentH;
      contentMinY = centerY - contentH / 2;
      contentMaxY = centerY + contentH / 2;
    }

    const scale = Math.min(contentWidth / contentW, contentHeight / contentH);
    const mapW = contentW * scale;
    const mapH = contentH * scale;
    const offsetX = (contentWidth - mapW) / 2;
    const offsetY = (contentHeight - mapH) / 2;

    return {
      contentMinX,
      contentMinY,
      contentMaxX,
      contentMaxY,
      scale,
      offsetX,
      offsetY,
      contentWidth,
      contentHeight,
      viewport,
      items,
    };
  }, [containerVersion, isMobile, items, minimapHeight, minimapWidth, panX, panY, zoom]);

  const getClampedMinimapPosition = useCallback((left: number, top: number, width = minimapWidth, height = minimapHeight) => {
    if (typeof window === 'undefined') return { left, top };
    const maxLeft = Math.max(MINIMAP_EDGE_PAD, window.innerWidth - width - MINIMAP_EDGE_PAD);
    const maxTop = Math.max(MINIMAP_TOP_PAD, window.innerHeight - height - MINIMAP_EDGE_PAD);
    return {
      left: clamp(left, MINIMAP_EDGE_PAD, maxLeft),
      top: clamp(top, MINIMAP_TOP_PAD, maxTop),
    };
  }, [minimapHeight, minimapWidth]);

  const minimapFrame = useMemo(() => {
    if (typeof window === 'undefined') {
      return { left: MINIMAP_EDGE_PAD, top: MINIMAP_TOP_PAD };
    }
    const fallbackLeft = window.innerWidth - minimapWidth - MINIMAP_EDGE_PAD;
    const fallbackTop = window.innerHeight - minimapHeight - MINIMAP_EDGE_PAD;
    return getClampedMinimapPosition(
      minimapX ?? fallbackLeft,
      minimapY ?? fallbackTop,
      minimapWidth,
      minimapHeight,
    );
  }, [getClampedMinimapPosition, minimapHeight, minimapWidth, minimapX, minimapY]);

  const getClampedAnchorsPanelPosition = useCallback((left: number, top: number, width = anchorsPanelWidth, height = anchorsPanelHeight) => {
    if (typeof window === 'undefined') return { left, top };
    const maxLeft = Math.max(MINIMAP_EDGE_PAD, window.innerWidth - width - MINIMAP_EDGE_PAD);
    const maxTop = Math.max(MINIMAP_TOP_PAD, window.innerHeight - height - MINIMAP_EDGE_PAD);
    return {
      left: clamp(left, MINIMAP_EDGE_PAD, maxLeft),
      top: clamp(top, MINIMAP_TOP_PAD, maxTop),
    };
  }, [anchorsPanelHeight, anchorsPanelWidth]);

  const anchorsPanelFrame = useMemo(() => {
    if (typeof window === 'undefined') {
      return { left: MINIMAP_EDGE_PAD, top: MINIMAP_TOP_PAD };
    }
    return getClampedAnchorsPanelPosition(
      anchorsPanelX ?? (window.innerWidth - anchorsPanelWidth - MINIMAP_EDGE_PAD),
      anchorsPanelY ?? MINIMAP_TOP_PAD,
    );
  }, [anchorsPanelWidth, anchorsPanelX, anchorsPanelY, getClampedAnchorsPanelPosition]);

  const rulerFrame = useMemo(() => {
    if (isMobile || layoutScope !== 'rulers' || !canvasRect) return null;
    const minWidth = 240;
    const minHeight = 160;
    const maxLeft = Math.max(0, canvasRect.width - rulerRight - minWidth);
    const maxRight = Math.max(0, canvasRect.width - rulerLeft - minWidth);
    const maxTop = Math.max(0, canvasRect.height - rulerBottom - minHeight);
    const maxBottom = Math.max(0, canvasRect.height - rulerTop - minHeight);
    const nextLeft = clamp(rulerLeft, 0, maxLeft);
    const nextRight = clamp(rulerRight, 0, maxRight);
    const nextTop = clamp(rulerTop, 0, maxTop);
    const nextBottom = clamp(rulerBottom, 0, maxBottom);

    return {
      left: canvasRect.left + nextLeft,
      right: canvasRect.right - nextRight,
      top: canvasRect.top + nextTop,
      bottom: canvasRect.bottom - nextBottom,
      centerX: canvasRect.left + nextLeft + (canvasRect.width - nextLeft - nextRight) / 2,
      centerY: canvasRect.top + nextTop + (canvasRect.height - nextTop - nextBottom) / 2,
    };
  }, [canvasRect, isMobile, layoutScope, rulerBottom, rulerLeft, rulerRight, rulerTop]);

  const updateRulerFromClient = useCallback((edge: 'left' | 'right' | 'top' | 'bottom', clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const state = useCanvasStore.getState();
    const minWidth = 240;
    const minHeight = 160;

    if (edge === 'left') {
      const maxLeft = Math.max(0, rect.width - state.rulerRight - minWidth);
      setRulerEdge('left', clamp(clientX - rect.left, 0, maxLeft));
      return;
    }
    if (edge === 'right') {
      const maxRight = Math.max(0, rect.width - state.rulerLeft - minWidth);
      setRulerEdge('right', clamp(rect.right - clientX, 0, maxRight));
      return;
    }
    if (edge === 'top') {
      const maxTop = Math.max(0, rect.height - state.rulerBottom - minHeight);
      setRulerEdge('top', clamp(clientY - rect.top, 0, maxTop));
      return;
    }

    const maxBottom = Math.max(0, rect.height - state.rulerTop - minHeight);
    setRulerEdge('bottom', clamp(rect.bottom - clientY, 0, maxBottom));
  }, [setRulerEdge]);

  const onRulerHandlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, edge: 'left' | 'right' | 'top' | 'bottom') => {
    e.preventDefault();
    e.stopPropagation();
    rulerDragRef.current = { edge };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onRulerHandlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = rulerDragRef.current;
    if (!drag) return;
    e.preventDefault();
    e.stopPropagation();
    updateRulerFromClient(drag.edge, e.clientX, e.clientY);
  }, [updateRulerFromClient]);

  const onRulerHandlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    rulerDragRef.current = null;
    e.stopPropagation();
  }, []);

  useEffect(() => {
    if (isMobile || !minimapVisible) return;
    if (minimapX !== minimapFrame.left || minimapY !== minimapFrame.top) {
      setMinimapPosition(minimapFrame.left, minimapFrame.top);
    }
  }, [isMobile, minimapFrame.left, minimapFrame.top, minimapVisible, minimapX, minimapY, setMinimapPosition]);

  useEffect(() => {
    if (isMobile || !anchorsPanelVisible) return;
    if (anchorsPanelX !== anchorsPanelFrame.left || anchorsPanelY !== anchorsPanelFrame.top) {
      setAnchorsPanelPosition(anchorsPanelFrame.left, anchorsPanelFrame.top);
    }
  }, [anchorsPanelFrame.left, anchorsPanelFrame.top, anchorsPanelVisible, anchorsPanelX, anchorsPanelY, isMobile, setAnchorsPanelPosition]);

  const centerDesktopViewport = useCallback((worldX: number, worldY: number) => {
    const el = containerRef.current;
    if (!el || isMobile) return;

    const nextLeft = Math.max(0, (WORLD_ORIGIN + worldX) * zoom - el.clientWidth / 2);
    const nextTop = Math.max(0, (WORLD_ORIGIN + worldY) * zoom - el.clientHeight / 2);
    el.scrollLeft = nextLeft;
    el.scrollTop = nextTop;
    setPan(nextLeft, nextTop);
  }, [isMobile, setPan, zoom]);

  const centerOnAnchor = useCallback((anchorId: string) => {
    const anchor = items.find((item) => item.id === anchorId && item.type === 'anchor');
    if (!anchor) return;

    const targetX = anchor.x + ITEM_SIZE / 2;
    const targetY = anchor.y + ITEM_SIZE / 2;

    if (isMobile) {
      const el = containerRef.current;
      if (!el) return;
      setPan(el.clientWidth / 2 - targetX * zoom, el.clientHeight / 2 - targetY * zoom);
      return;
    }

    centerDesktopViewport(targetX, targetY);
  }, [centerDesktopViewport, isMobile, items, setPan, zoom]);

  useEffect(() => {
    const handleCenterWindow = (event: Event) => {
      const itemId = (event as CustomEvent<{ itemId?: string }>).detail?.itemId;
      if (!itemId) return;

      useCanvasStore.getState().openWindow(itemId);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const latest = useCanvasStore.getState().items.find((item) => item.id === itemId);
          if (!latest?.window) return;

          const centerX = latest.window.x + latest.window.w / 2;
          const centerY = latest.window.y + latest.window.h / 2;

          if (isMobile) {
            const el = containerRef.current;
            if (!el) return;
            setPan(el.clientWidth / 2 - centerX * zoom, el.clientHeight / 2 - centerY * zoom);
            return;
          }

          centerDesktopViewport(centerX, centerY);
        });
      });
    };

    window.addEventListener('center-canvas-window', handleCenterWindow as EventListener);
    return () => window.removeEventListener('center-canvas-window', handleCenterWindow as EventListener);
  }, [centerDesktopViewport, isMobile, setPan, zoom]);

  useEffect(() => {
    const handleCenterItem = (event: Event) => {
      const itemId = (event as CustomEvent<{ itemId?: string }>).detail?.itemId;
      if (!itemId) return;

      const latest = useCanvasStore.getState().items.find((item) => item.id === itemId);
      if (!latest) return;

      const centerX = latest.window?.isOpen
        ? latest.window.x + latest.window.w / 2
        : latest.x + ITEM_SIZE / 2;
      const centerY = latest.window?.isOpen
        ? latest.window.y + latest.window.h / 2
        : latest.y + ITEM_SIZE / 2;

      if (isMobile) {
        const el = containerRef.current;
        if (!el) return;
        setPan(el.clientWidth / 2 - centerX * zoom, el.clientHeight / 2 - centerY * zoom);
        return;
      }

      centerDesktopViewport(centerX, centerY);
    };

    window.addEventListener('center-canvas-item', handleCenterItem as EventListener);
    return () => window.removeEventListener('center-canvas-item', handleCenterItem as EventListener);
  }, [centerDesktopViewport, isMobile, setPan, zoom]);

  const moveFromMinimapClient = useCallback((clientX: number, clientY: number, rect: DOMRect) => {
    const model = minimapModel;
    if (!model) return;

    const localX = clamp(clientX - rect.left, 0, rect.width);
    const localY = clamp(clientY - rect.top, 0, rect.height);
    const viewportWidth = model.viewport.maxX - model.viewport.minX;
    const viewportHeight = model.viewport.maxY - model.viewport.minY;
    const viewportMapW = viewportWidth * model.scale;
    const viewportMapH = viewportHeight * model.scale;
    const viewportLeft = model.offsetX + (model.viewport.minX - model.contentMinX) * model.scale;
    const viewportTop = model.offsetY + (model.viewport.minY - model.contentMinY) * model.scale;

    if (minimapDragRef.current.mode === 'viewport') {
      const mapWidth = model.contentWidth - model.offsetX * 2;
      const mapHeight = model.contentHeight - model.offsetY * 2;
      const minLeft = model.offsetX - viewportMapW / 2;
      const minTop = model.offsetY - viewportMapH / 2;
      const maxLeft = model.offsetX + mapWidth - viewportMapW / 2;
      const maxTop = model.offsetY + mapHeight - viewportMapH / 2;
      const nextViewportLeft = clamp(localX - minimapDragRef.current.offsetX, minLeft, maxLeft);
      const nextViewportTop = clamp(localY - minimapDragRef.current.offsetY, minTop, maxTop);
      const minX = model.contentMinX + (nextViewportLeft - model.offsetX) / model.scale;
      const minY = model.contentMinY + (nextViewportTop - model.offsetY) / model.scale;
      centerDesktopViewport(minX + viewportWidth / 2, minY + viewportHeight / 2);
      return;
    }

    const clickedInsideViewport = (
      localX >= viewportLeft &&
      localX <= viewportLeft + viewportMapW &&
      localY >= viewportTop &&
      localY <= viewportTop + viewportMapH
    );

    if (clickedInsideViewport) {
      minimapDragRef.current = {
        active: true,
        mode: 'viewport',
        offsetX: localX - viewportLeft,
        offsetY: localY - viewportTop,
      };
      return;
    }

    const worldX = model.contentMinX + (localX - model.offsetX) / model.scale;
    const worldY = model.contentMinY + (localY - model.offsetY) / model.scale;
    centerDesktopViewport(worldX, worldY);
  }, [centerDesktopViewport, minimapModel]);

  const onMinimapPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    minimapDragRef.current = { active: true, mode: 'jump', offsetX: 0, offsetY: 0 };
    moveFromMinimapClient(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [moveFromMinimapClient]);

  const onMinimapPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!minimapDragRef.current.active) return;
    e.preventDefault();
    e.stopPropagation();
    moveFromMinimapClient(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
  }, [moveFromMinimapClient]);

  const onMinimapPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    minimapDragRef.current = { active: false, mode: 'jump', offsetX: 0, offsetY: 0 };
    e.stopPropagation();
  }, []);

  const onMinimapResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, edge: string) => {
    e.preventDefault();
    e.stopPropagation();
    minimapResizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      left: minimapFrame.left,
      top: minimapFrame.top,
      width: minimapWidth,
      height: minimapHeight,
      edge,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [minimapFrame.left, minimapFrame.top, minimapHeight, minimapWidth]);

  const onMinimapResizePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const resize = minimapResizeRef.current;
    if (!resize) return;
    e.preventDefault();
    e.stopPropagation();
    const dx = e.clientX - resize.startX;
    const dy = e.clientY - resize.startY;
    let nextLeft = resize.left;
    let nextTop = resize.top;
    let nextWidth = resize.width;
    let nextHeight = resize.height;

    if (resize.edge.includes('r')) nextWidth = Math.max(MINIMAP_MIN_W, resize.width + dx);
    if (resize.edge.includes('b')) nextHeight = Math.max(MINIMAP_MIN_H, resize.height + dy);
    if (resize.edge.includes('l')) {
      const widthFromLeft = Math.max(MINIMAP_MIN_W, resize.width - dx);
      nextLeft = resize.left + (resize.width - widthFromLeft);
      nextWidth = widthFromLeft;
    }
    if (resize.edge.includes('t')) {
      const heightFromTop = Math.max(MINIMAP_MIN_H, resize.height - dy);
      nextTop = resize.top + (resize.height - heightFromTop);
      nextHeight = heightFromTop;
    }

    const clamped = getClampedMinimapPosition(nextLeft, nextTop, nextWidth, nextHeight);
    setMinimapSize(nextWidth, nextHeight);
    setMinimapPosition(clamped.left, clamped.top);
  }, [getClampedMinimapPosition, setMinimapPosition, setMinimapSize]);

  const onMinimapResizePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    minimapResizeRef.current = null;
    e.stopPropagation();
  }, []);

  const onMinimapTitlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    minimapWindowDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      left: minimapFrame.left,
      top: minimapFrame.top,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [minimapFrame.left, minimapFrame.top]);

  const onMinimapTitlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = minimapWindowDragRef.current;
    if (!drag) return;
    e.preventDefault();
    e.stopPropagation();
    const clamped = getClampedMinimapPosition(
      drag.left + (e.clientX - drag.startX),
      drag.top + (e.clientY - drag.startY),
    );
    setMinimapPosition(clamped.left, clamped.top);
  }, [getClampedMinimapPosition, setMinimapPosition]);

  const onMinimapTitlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    minimapWindowDragRef.current = null;
    e.stopPropagation();
  }, []);

  const onAnchorsTitlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    anchorsPanelDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      left: anchorsPanelFrame.left,
      top: anchorsPanelFrame.top,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [anchorsPanelFrame.left, anchorsPanelFrame.top]);

  const onAnchorsTitlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = anchorsPanelDragRef.current;
    if (!drag) return;
    e.preventDefault();
    e.stopPropagation();
    const clamped = getClampedAnchorsPanelPosition(
      drag.left + (e.clientX - drag.startX),
      drag.top + (e.clientY - drag.startY),
    );
    setAnchorsPanelPosition(clamped.left, clamped.top);
  }, [getClampedAnchorsPanelPosition, setAnchorsPanelPosition]);

  const onAnchorsTitlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    anchorsPanelDragRef.current = null;
    e.stopPropagation();
  }, []);

  const onAnchorsResizePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, edge: string) => {
    e.preventDefault();
    e.stopPropagation();
    anchorsPanelResizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      left: anchorsPanelFrame.left,
      top: anchorsPanelFrame.top,
      width: anchorsPanelWidth,
      height: anchorsPanelHeight,
      edge,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [anchorsPanelFrame.left, anchorsPanelFrame.top, anchorsPanelHeight, anchorsPanelWidth]);

  const onAnchorsResizePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const resize = anchorsPanelResizeRef.current;
    if (!resize) return;
    e.preventDefault();
    e.stopPropagation();
    const dx = e.clientX - resize.startX;
    const dy = e.clientY - resize.startY;
    let nextLeft = resize.left;
    let nextTop = resize.top;
    let nextWidth = resize.width;
    let nextHeight = resize.height;

    if (resize.edge.includes('r')) nextWidth = Math.max(220, resize.width + dx);
    if (resize.edge.includes('b')) nextHeight = Math.max(140, resize.height + dy);
    if (resize.edge.includes('l')) {
      const widthFromLeft = Math.max(220, resize.width - dx);
      nextLeft = resize.left + (resize.width - widthFromLeft);
      nextWidth = widthFromLeft;
    }
    if (resize.edge.includes('t')) {
      const heightFromTop = Math.max(140, resize.height - dy);
      nextTop = resize.top + (resize.height - heightFromTop);
      nextHeight = heightFromTop;
    }

    const clamped = getClampedAnchorsPanelPosition(nextLeft, nextTop, nextWidth, nextHeight);
    setAnchorsPanelSize(nextWidth, nextHeight);
    setAnchorsPanelPosition(clamped.left, clamped.top);
  }, [getClampedAnchorsPanelPosition, setAnchorsPanelPosition, setAnchorsPanelSize]);

  const onAnchorsResizePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    anchorsPanelResizeRef.current = null;
    e.stopPropagation();
  }, []);

  return (
    <div
      ref={setRefs}
      className={`flex-1 relative bg-canvas-bg ${isMobile ? 'overflow-hidden' : 'overflow-auto'}`}
      data-canvas="bg"
      data-canvas-root="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onContextMenu={handleContextMenu}
      style={{ touchAction: 'none' }}
    >
      {isMobile ? (
        <>
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.03]"
            style={{
              backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
              backgroundSize: `${GRID * zoom}px ${GRID * zoom}px`,
              backgroundPosition: `${panX % (GRID * zoom)}px ${panY % (GRID * zoom)}px`,
            }}
          />
          <div
            style={{
              transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
              transformOrigin: '0 0',
              position: 'absolute',
              top: 0,
              left: 0,
            }}
          >
            {worldItems.map((item) => (
              <CanvasItemNode key={item.id} item={item} />
            ))}
          </div>
        </>
      ) : (
        <div
          className="relative"
          data-canvas="bg"
          style={{ width: WORLD_SIZE * zoom, height: WORLD_SIZE * zoom }}
        >
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.03]"
            data-canvas="bg"
            style={{
              backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
              backgroundSize: `${GRID * zoom}px ${GRID * zoom}px`,
              backgroundPosition: `${WORLD_ORIGIN * zoom}px ${WORLD_ORIGIN * zoom}px`,
            }}
          />
          {worldItems.map((item) => (
            <CanvasItemNode key={item.id} item={item} originX={WORLD_ORIGIN} originY={WORLD_ORIGIN} zoom={zoom} />
          ))}
          {openWindows.map((item) => (
            <Window key={item.id} item={item} originX={WORLD_ORIGIN} originY={WORLD_ORIGIN} zoom={zoom} />
          ))}
        </div>
      )}

      {!isMobile && pinnedItems.length > 0 && typeof document !== 'undefined' && createPortal(
        <>
          {canvasRect && (
            <div
              className="fixed pointer-events-none opacity-[0.05]"
              style={{
                left: canvasRect.left,
                top: canvasRect.top,
                width: canvasRect.width,
                height: canvasRect.height,
                zIndex: BOARD_Z.viewportPinnedGrid,
                backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
                backgroundSize: `${GRID}px ${GRID}px`,
                backgroundPosition: '0 0',
              }}
            />
          )}
          {pinnedItems.map((item) => {
            return (
              <CanvasItemNode
                key={`pinned-${item.id}`}
                item={item}
                viewportPinned
                screenX={(canvasRect?.left ?? 0) + (item.pinnedViewportX ?? 0)}
                screenY={(canvasRect?.top ?? 0) + (item.pinnedViewportY ?? 0)}
              />
            );
          })}
        </>,
        document.body,
      )}

      {!isMobile && layoutScope === 'rulers' && rulerFrame && typeof document !== 'undefined' && createPortal(
        <>
          <div
            className="fixed pointer-events-none border border-dashed border-canvas-accent/80"
            style={{
              left: rulerFrame.left,
              top: rulerFrame.top,
              width: Math.max(1, rulerFrame.right - rulerFrame.left),
              height: Math.max(1, rulerFrame.bottom - rulerFrame.top),
              zIndex: BOARD_Z.rulers,
            }}
          />
          {[
            {
              edge: 'left' as const,
              left: rulerFrame.left - 7,
              top: rulerFrame.centerY - 7,
              cursor: 'ew-resize',
            },
            {
              edge: 'right' as const,
              left: rulerFrame.right - 7,
              top: rulerFrame.centerY - 7,
              cursor: 'ew-resize',
            },
            {
              edge: 'top' as const,
              left: rulerFrame.centerX - 7,
              top: rulerFrame.top - 7,
              cursor: 'ns-resize',
            },
            {
              edge: 'bottom' as const,
              left: rulerFrame.centerX - 7,
              top: rulerFrame.bottom - 7,
              cursor: 'ns-resize',
            },
          ].map((handle) => (
            <div
              key={handle.edge}
              className="fixed h-3.5 w-3.5 rounded-sm border border-canvas-accent bg-canvas-bg shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
              data-canvas-interactive="true"
              style={{
                left: handle.left,
                top: handle.top,
                cursor: handle.cursor,
                zIndex: BOARD_Z.rulerHandles,
              }}
              onPointerDown={(e) => onRulerHandlePointerDown(e, handle.edge)}
              onPointerMove={onRulerHandlePointerMove}
              onPointerUp={onRulerHandlePointerUp}
            />
          ))}
        </>,
        document.body,
      )}

      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}

      {!isMobile && anchorsPanelVisible && typeof document !== 'undefined' && createPortal(
        <AnchorsPanel
          anchors={anchors.map((item) => ({ id: item.id, title: getCanvasItemTitle(item) }))}
          width={anchorsPanelWidth}
          height={anchorsPanelHeight}
          left={anchorsPanelFrame.left}
          top={anchorsPanelFrame.top}
          onSelect={(id) => {
            focusAnchor(id);
            centerOnAnchor(id);
          }}
          onRename={(id, title) => updateItem(id, { label: title })}
          onDelete={removeItem}
          onMinimize={() => {
            setAnchorsPanelPosition(anchorsPanelFrame.left, anchorsPanelFrame.top);
            setAnchorsPanelVisible(false);
          }}
          onTitlePointerDown={onAnchorsTitlePointerDown}
          onTitlePointerMove={onAnchorsTitlePointerMove}
          onTitlePointerUp={onAnchorsTitlePointerUp}
          onResizePointerDown={onAnchorsResizePointerDown}
          onResizePointerMove={onAnchorsResizePointerMove}
          onResizePointerUp={onAnchorsResizePointerUp}
        />,
        document.body,
      )}

      {!isMobile && minimapVisible && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed rounded-lg border border-canvas-border bg-canvas-surface/95 shadow-2xl backdrop-blur-sm overflow-hidden"
          data-canvas-interactive="true"
          style={{ width: minimapWidth, height: minimapHeight, left: minimapFrame.left, top: minimapFrame.top, zIndex: BOARD_Z.minimap }}
        >
          <div
            className="relative z-10 h-8 flex items-center px-2 gap-2 shrink-0 select-none cursor-move bg-canvas-bg border-b border-canvas-border"
            data-canvas-interactive="true"
            onPointerDown={onMinimapTitlePointerDown}
            onPointerMove={onMinimapTitlePointerMove}
            onPointerUp={onMinimapTitlePointerUp}
          >
            <span className="w-2 h-2 rounded-full bg-canvas-accent shrink-0" />
            <span className="text-xs text-canvas-text truncate flex-1">Map</span>
            <button
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-canvas-border shrink-0"
              data-canvas-interactive="true"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setMinimapPosition(minimapFrame.left, minimapFrame.top);
                setMinimapVisible(false);
              }}
              title="Minimize map"
            >
              <Minus size={12} className="text-canvas-muted" />
            </button>
          </div>
          <div className="absolute inset-x-0 bottom-0 top-8 bg-canvas-bg/70" />
          <div
            className="absolute inset-x-0 bottom-0 top-8 opacity-[0.08]"
            style={{
              backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
              backgroundSize: '12px 12px',
            }}
          />
          {minimapModel ? (
            <div
              className="absolute inset-x-0 bottom-0 top-8"
              data-canvas-interactive="true"
              onPointerDown={onMinimapPointerDown}
              onPointerMove={onMinimapPointerMove}
              onPointerUp={onMinimapPointerUp}
            >
              {minimapModel.items.map((item) => {
                const baseX = minimapModel.offsetX + (item.x - minimapModel.contentMinX) * minimapModel.scale;
                const baseY = minimapModel.offsetY + (item.y - minimapModel.contentMinY) * minimapModel.scale;
                const iconW = Math.max(4, ITEM_SIZE * minimapModel.scale);
                const iconH = Math.max(4, ITEM_SIZE * minimapModel.scale);
                const minimapStyle = getMinimapStatusStyle(item);
                return (
                  <div key={`minimap-item-${item.id}`}>
                    <div
                      className={`absolute rounded-sm border ${minimapStyle.itemClass}`}
                      style={{ left: baseX, top: baseY, width: iconW, height: iconH }}
                    />
                    {item.window?.isOpen && (
                      <div
                        className={`absolute rounded-sm border ${minimapStyle.windowClass}`}
                        style={{
                          left: minimapModel.offsetX + (item.window.x - minimapModel.contentMinX) * minimapModel.scale,
                          top: minimapModel.offsetY + (item.window.y - minimapModel.contentMinY) * minimapModel.scale,
                          width: Math.max(6, item.window.w * minimapModel.scale),
                          height: Math.max(6, item.window.h * minimapModel.scale),
                        }}
                      />
                    )}
                  </div>
                );
              })}
              <div
                className="absolute border border-sky-400/90 bg-sky-400/10 rounded-sm shadow-[0_0_0_1px_rgba(56,189,248,0.15)]"
                style={{
                  left: minimapModel.offsetX + (minimapModel.viewport.minX - minimapModel.contentMinX) * minimapModel.scale,
                  top: minimapModel.offsetY + (minimapModel.viewport.minY - minimapModel.contentMinY) * minimapModel.scale,
                  width: Math.max(10, (minimapModel.viewport.maxX - minimapModel.viewport.minX) * minimapModel.scale),
                  height: Math.max(10, (minimapModel.viewport.maxY - minimapModel.viewport.minY) * minimapModel.scale),
                }}
              />
            </div>
          ) : (
            <div className="absolute inset-x-0 bottom-0 top-8 flex items-center justify-center text-[11px] uppercase tracking-[0.18em] text-canvas-muted">
              Map
            </div>
          )}
          {[
            { edge: 't', className: 'absolute top-0 left-3 right-3 h-1 cursor-ns-resize' },
            { edge: 'r', className: 'absolute top-3 bottom-3 right-0 w-1 cursor-ew-resize' },
            { edge: 'b', className: 'absolute bottom-0 left-3 right-3 h-1 cursor-ns-resize' },
            { edge: 'l', className: 'absolute top-3 bottom-3 left-0 w-1 cursor-ew-resize' },
            { edge: 'tl', className: 'absolute top-0 left-0 w-4 h-4 cursor-nwse-resize' },
            { edge: 'tr', className: 'absolute top-0 right-0 w-4 h-4 cursor-nesw-resize' },
            { edge: 'br', className: 'absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize' },
            { edge: 'bl', className: 'absolute left-0 bottom-0 w-4 h-4 cursor-nesw-resize' },
          ].map(({ edge, className }) => (
            <div
              key={edge}
              className={className}
              data-canvas-interactive="true"
              onPointerDown={(e) => onMinimapResizePointerDown(e, edge)}
              onPointerMove={onMinimapResizePointerMove}
              onPointerUp={onMinimapResizePointerUp}
            />
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
