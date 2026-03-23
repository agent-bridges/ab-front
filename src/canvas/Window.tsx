import { useCallback, useRef } from 'react';
import { Minus, RefreshCw, Terminal, FolderOpen, StickyNote, X, Eye, Pencil, Lock, Unlock, MapPin } from 'lucide-react';
import { useCanvasStore } from '../stores/canvasStore';
import { useIsMobile } from '../hooks/useIsMobile';
import { getTerminalStatusDetail, getTerminalStatusMeta } from '../components/ProcessIndicator';
import ClaudeIcon from '../components/icons/ClaudeIcon';
import CodexIcon from '../components/icons/CodexIcon';
import TerminalView from '../components/terminal/TerminalView';
import { forceRefresh } from '../components/terminal/TerminalCache';
import FileBrowserView from '../components/filebrowser/FileBrowserView';
import NotesEditor from '../components/notes/NotesEditor';
import type { CanvasItem, CanvasItemType } from '../types';
import { getCanvasItemTitle } from '../utils/canvasItemTitle';
import { useNoteViewMode } from '../hooks/useNoteViewMode';
import { getWindowZIndex } from './zIndexManager';

const ICONS: Partial<Record<CanvasItemType, typeof Terminal>> = {
  terminal: Terminal,
  filebrowser: FolderOpen,
  notes: StickyNote,
  anchor: MapPin,
};

const MIN_W = 300;
const MIN_H = 200;
const TOOLBAR_H = 40;
const VIEWPORT_PADDING = 24;
const SIZE_PRESETS = [
  { label: '1/4', fraction: 0.25 },
  { label: '1/3', fraction: 1 / 3 },
  { label: '1/2', fraction: 0.5 },
] as const;

export default function Window({
  item,
  originX = 0,
  originY = 0,
  zoom = 1,
}: {
  item: CanvasItem;
  originX?: number;
  originY?: number;
  zoom?: number;
}) {
  const win = item.window!;
  const { closeWindow, minimizeWindow, focusWindow, moveWindow, resizeWindow, toggleWindowLocked, panX, panY } = useCanvasStore();
  const draggingWindowId = useCanvasStore((s) => s.draggingWindowId);
  const startDraggingWindow = useCanvasStore((s) => s.startDraggingWindow);
  const stopDraggingWindow = useCanvasStore((s) => s.stopDraggingWindow);
  const items = useCanvasStore((s) => s.items);
  const isMobile = useIsMobile();
  const Icon = ICONS[item.type] || Terminal;
  const movementScale = isMobile ? 1 : zoom;
  const { mode: noteMode, setMode: setNoteMode } = useNoteViewMode(item.id);
  const maxZ = Math.max(...items.filter((i) => i.window?.isOpen).map((i) => i.window!.zIndex));
  const isActive = win.zIndex === maxZ;
  const isDragging = draggingWindowId === item.id;
  const terminalMeta = item.type === 'terminal' ? getTerminalStatusMeta(item.ptyAlive, item.ptyProcesses, item.aiStatus) : null;
  const terminalDetail = terminalMeta ? getTerminalStatusDetail(terminalMeta) : null;

  // Title bar drag
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, winX: 0, winY: 0 });

  const onTitlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    focusWindow(item.id);
    startDraggingWindow(item.id);
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, winX: win.x, winY: win.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [focusWindow, item.id, startDraggingWindow, win.x, win.y]);

  const onTitlePointerMove = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    if (!dragRef.current.dragging) return;
    const dx = (e.clientX - dragRef.current.startX) / movementScale;
    const dy = (e.clientY - dragRef.current.startY) / movementScale;
    moveWindow(item.id, dragRef.current.winX + dx, dragRef.current.winY + dy);
  }, [item.id, moveWindow, movementScale]);

  const onTitlePointerUp = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    dragRef.current.dragging = false;
    stopDraggingWindow();
  }, [stopDraggingWindow]);

  // Resize handles
  const resizeRef = useRef({ active: false, edge: '', startX: 0, startY: 0, winX: 0, winY: 0, winW: 0, winH: 0 });

  const onResizePointerDown = useCallback((e: React.PointerEvent, edge: string) => {
    e.preventDefault();
    e.stopPropagation();
    focusWindow(item.id);
    startDraggingWindow(item.id);
    resizeRef.current = {
      active: true,
      edge,
      startX: e.clientX,
      startY: e.clientY,
      winX: win.x,
      winY: win.y,
      winW: win.w,
      winH: win.h,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [focusWindow, item.id, startDraggingWindow, win.h, win.w, win.x, win.y]);

  const onResizePointerMove = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    if (!resizeRef.current.active) return;
    const r = resizeRef.current;
    const dx = (e.clientX - r.startX) / movementScale;
    const dy = (e.clientY - r.startY) / movementScale;
    let { winX: x, winY: y, winW: w, winH: h } = r;

    if (r.edge.includes('r')) w = Math.max(MIN_W, r.winW + dx);
    if (r.edge.includes('b')) h = Math.max(MIN_H, r.winH + dy);
    if (r.edge.includes('l')) {
      const newW = Math.max(MIN_W, r.winW - dx);
      x = r.winX + (r.winW - newW);
      w = newW;
    }
    if (r.edge.includes('t')) {
      const newH = Math.max(MIN_H, r.winH - dy);
      y = r.winY + (r.winH - newH);
      h = newH;
    }

    moveWindow(item.id, x, y);
    resizeWindow(item.id, w, h);
  }, [item.id, moveWindow, movementScale, resizeWindow]);

  const onResizePointerUp = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    resizeRef.current.active = false;
    stopDraggingWindow();
  }, [stopDraggingWindow]);

  const handleFocus = useCallback(() => focusWindow(item.id), [item.id, focusWindow]);

  const resizeToViewportFraction = useCallback((fraction: number) => {
    if (isMobile) return;
    const canvasRoot = document.querySelector<HTMLElement>('[data-canvas-root="true"]');
    if (!canvasRoot) return;

    const viewportW = canvasRoot.clientWidth / zoom;
    const viewportH = canvasRoot.clientHeight / zoom;
    const viewportX = panX / zoom - originX;
    const viewportY = panY / zoom - originY;
    const usableW = Math.max(MIN_W, viewportW - VIEWPORT_PADDING * 2);
    const usableH = Math.max(MIN_H, viewportH - VIEWPORT_PADDING * 2);
    const scale = Math.sqrt(fraction);
    const nextW = Math.max(MIN_W, usableW * scale);
    const nextH = Math.max(MIN_H, usableH * scale);
    const nextX = viewportX + (viewportW - nextW) / 2;
    const nextY = viewportY + (viewportH - nextH) / 2;

    focusWindow(item.id);
    moveWindow(item.id, nextX, nextY);
    resizeWindow(item.id, nextW, nextH);
  }, [focusWindow, isMobile, item.id, moveWindow, originX, originY, panX, panY, resizeWindow, zoom]);

  const mobileStyle: React.CSSProperties = {
    left: 0,
    top: TOOLBAR_H,
    width: '100vw',
    height: `calc(100vh - ${TOOLBAR_H}px)`,
    zIndex: getWindowZIndex(win, { isDragging }),
    borderRadius: 0,
  };

  const desktopStyle: React.CSSProperties = {
    left: (originX + win.x) * zoom,
    top: (originY + win.y) * zoom,
    width: Math.max(MIN_W * 0.6, win.w * zoom),
    height: Math.max(MIN_H * 0.6, win.h * zoom),
    zIndex: getWindowZIndex(win, { isDragging }),
  };

  return (
    <div
      className={`absolute flex flex-col bg-canvas-surface border rounded-lg shadow-2xl overflow-hidden ${
        isActive ? 'border-canvas-accent/40' : 'border-canvas-border'
      }`}
      style={isMobile ? mobileStyle : desktopStyle}
      data-canvas-interactive="true"
      onPointerDown={(e) => { e.stopPropagation(); handleFocus(); }}
      onPointerMove={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <div
        className={`h-8 flex items-center px-2 gap-2 shrink-0 select-none ${isMobile ? '' : 'cursor-move'} ${
          isActive ? 'bg-canvas-accent/15' : 'bg-canvas-bg'
        }`}
        onPointerDown={isMobile ? undefined : onTitlePointerDown}
        onPointerMove={isMobile ? undefined : onTitlePointerMove}
        onPointerUp={isMobile ? undefined : onTitlePointerUp}
      >
        {(() => {
          if (terminalMeta?.aiAgent === 'claude') return <ClaudeIcon size={14} className={`shrink-0 ${terminalMeta.status === 'ai-busy' ? 'text-orange-400 animate-pulse' : 'text-green-400'}`} />;
          if (terminalMeta?.aiAgent === 'codex') return <CodexIcon size={14} className={`shrink-0 ${terminalMeta.status === 'ai-busy' ? 'text-orange-400 animate-pulse' : 'text-green-400'}`} />;
          if (terminalMeta?.status === 'busy') return <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />;
          if (terminalMeta?.status === 'ai-idle') return <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />;
          if (terminalMeta?.status === 'idle') return <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />;
          if (terminalMeta?.status === 'dead') return <span className="w-2 h-2 rounded-full bg-neutral-500 shrink-0" />;
          return <Icon size={12} className="text-canvas-accent shrink-0" />;
        })()}
        <span className="text-xs text-canvas-text truncate flex-1">
          {getCanvasItemTitle(item, { fullPath: item.type === 'filebrowser' })}
          {item.type === 'terminal' && (() => {
            if (terminalDetail) return <span className={terminalDetail.className}>{terminalDetail.text}</span>;
            return null;
          })()}
        </span>
        {!isMobile && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              toggleWindowLocked(item.id);
            }}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-canvas-border"
            title={win.locked ? 'Unlock window' : 'Lock window'}
          >
            {win.locked ? (
              <Lock size={12} className="text-canvas-accent" />
            ) : (
              <Unlock size={12} className="text-canvas-muted" />
            )}
          </button>
        )}
        {item.type === 'terminal' && item.ptyId && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); forceRefresh(item.ptyId!); }}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-canvas-accent/30"
            title="Refresh terminal"
          >
            <RefreshCw size={10} className="text-canvas-muted" />
          </button>
        )}
        {!isMobile && (
          <div className="flex items-center gap-1 shrink-0">
            {SIZE_PRESETS.map(({ label, fraction }) => (
              <button
                key={label}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  resizeToViewportFraction(fraction);
                }}
                className="h-6 w-7 flex items-center justify-center rounded text-[10px] font-semibold text-canvas-muted hover:bg-canvas-border hover:text-canvas-accent"
                title={`Resize to ${label} of viewport`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {item.type === 'notes' && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setNoteMode(noteMode === 'edit' ? 'preview' : 'edit');
            }}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-canvas-border"
            title={noteMode === 'edit' ? 'Preview markdown' : 'Edit note'}
          >
            {noteMode === 'edit' ? (
              <Eye size={12} className="text-canvas-muted" />
            ) : (
              <Pencil size={12} className="text-canvas-muted" />
            )}
          </button>
        )}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); minimizeWindow(item.id); }}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-canvas-border"
          title="Minimize window"
        >
          <Minus size={12} className="text-canvas-muted" />
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); closeWindow(item.id); }}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/20"
          title="Close window"
        >
          <X size={12} className="text-canvas-muted" />
        </button>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {item.type === 'terminal' && <TerminalView item={item} />}
        {item.type === 'filebrowser' && <FileBrowserView item={item} />}
        {item.type === 'notes' && <NotesEditor item={item} mode={noteMode} />}
      </div>

      {!isMobile && (
        <>
          <div className="absolute top-0 left-2 right-2 h-1 cursor-n-resize"
            onPointerDown={(e) => onResizePointerDown(e, 't')}
            onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} />
          <div className="absolute bottom-0 left-2 right-2 h-1 cursor-s-resize"
            onPointerDown={(e) => onResizePointerDown(e, 'b')}
            onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} />
          <div className="absolute left-0 top-2 bottom-2 w-1 cursor-w-resize"
            onPointerDown={(e) => onResizePointerDown(e, 'l')}
            onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} />
          <div className="absolute right-0 top-2 bottom-2 w-1 cursor-e-resize"
            onPointerDown={(e) => onResizePointerDown(e, 'r')}
            onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} />
          <div className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize"
            onPointerDown={(e) => onResizePointerDown(e, 'tl')}
            onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} />
          <div className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize"
            onPointerDown={(e) => onResizePointerDown(e, 'tr')}
            onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} />
          <div className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize"
            onPointerDown={(e) => onResizePointerDown(e, 'bl')}
            onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} />
          <div className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize"
            onPointerDown={(e) => onResizePointerDown(e, 'br')}
            onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp} />
        </>
      )}
    </div>
  );
}
