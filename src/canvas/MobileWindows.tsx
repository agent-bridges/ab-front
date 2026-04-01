import { useState, useEffect } from 'react';
import { Minus, RotateCw, Terminal, FolderOpen, StickyNote, LayoutGrid, Eye, Pencil, MapPin } from 'lucide-react';
import { useCanvasStore } from '../stores/canvasStore';
import TerminalView from '../components/terminal/TerminalView';
import FileBrowserView from '../components/filebrowser/FileBrowserView';
import NotesEditor from '../components/notes/NotesEditor';
import { getCanvasItemTitle } from '../utils/canvasItemTitle';
import type { CanvasItem, CanvasItemType } from '../types';
import { useNoteViewMode } from '../hooks/useNoteViewMode';

const ICONS: Partial<Record<CanvasItemType, typeof Terminal>> = {
  terminal: Terminal,
  filebrowser: FolderOpen,
  notes: StickyNote,
  anchor: MapPin,
};

const TOOLBAR_H = 40;
const TAB_H = 36;

export default function MobileWindows() {
  const items = useCanvasStore((s) => s.items);
  const closeWindow = useCanvasStore((s) => s.closeWindow);

  const openWindows = items.filter((i) => i.window?.isOpen);
  // null = canvas tab, string = window id
  const [activeId, setActiveId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // When window closed, go back to canvas
  useEffect(() => {
    if (openWindows.length === 0) {
      setActiveId(null);
      return;
    }
    if (activeId && !openWindows.find((w) => w.id === activeId)) {
      setActiveId(null);
    }
  }, [openWindows, activeId]);

  // Listen for icon taps from MobileIconGrid
  useEffect(() => {
    const handler = (e: Event) => {
      const itemId = (e as CustomEvent).detail?.itemId;
      if (itemId) setActiveId(itemId);
    };
    window.addEventListener('mobile-open-tab', handler);
    return () => window.removeEventListener('mobile-open-tab', handler);
  }, []);

  const activeItem = activeId ? openWindows.find((w) => w.id === activeId) : null;
  const { mode: noteMode, setMode: setNoteMode } = useNoteViewMode(activeItem?.id || 'mobile-notes');

  if (openWindows.length === 0) return null;

  return (
    <>
      {/* Full-screen window content — only when viewing a window */}
      {activeItem && (
        <div
          className="fixed inset-0 flex flex-col bg-canvas-bg z-50"
          style={{ top: TOOLBAR_H, bottom: TAB_H }}
        >
          {/* Title bar */}
          <div className="h-8 bg-canvas-bg flex items-center px-3 gap-2 shrink-0 border-b border-canvas-border">
            {(() => {
              const Icon = ICONS[activeItem.type] || Terminal;
              return <Icon size={12} className="text-canvas-accent shrink-0" />;
            })()}
            <span className="text-xs text-canvas-text truncate flex-1">{getCanvasItemTitle(activeItem, { fullPath: true })}</span>
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-canvas-border"
            >
              <RotateCw size={13} className="text-canvas-muted" />
            </button>
            {activeItem.type === 'notes' && (
              <button
                onClick={() => setNoteMode(noteMode === 'edit' ? 'preview' : 'edit')}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-canvas-border"
                title={noteMode === 'edit' ? 'Preview markdown' : 'Edit note'}
              >
                {noteMode === 'edit' ? (
                  <Eye size={13} className="text-canvas-muted" />
                ) : (
                  <Pencil size={13} className="text-canvas-muted" />
                )}
              </button>
            )}
            <button
              onClick={() => { closeWindow(activeItem.id); setActiveId(null); }}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-canvas-border"
              title="Minimize window"
            >
              <Minus size={14} className="text-canvas-muted" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden relative" key={`${activeItem.id}-${refreshKey}`}>
            {activeItem.type === 'terminal' && <TerminalView item={activeItem} />}
            {activeItem.type === 'filebrowser' && <FileBrowserView item={activeItem} />}
            {activeItem.type === 'notes' && <NotesEditor item={activeItem} mode={noteMode} />}
          </div>
        </div>
      )}

      {/* Tab bar — fixed at bottom, always visible when windows open */}
      <div
        className="fixed bottom-0 left-0 right-0 flex items-center bg-canvas-surface border-t border-canvas-border overflow-x-auto z-50"
        style={{ height: TAB_H }}
      >
        {/* Canvas tab */}
        <button
          onClick={() => setActiveId(null)}
          className={`flex items-center gap-1.5 px-3 h-full text-xs whitespace-nowrap border-r border-canvas-border transition-colors ${
            !activeId
              ? 'bg-canvas-bg text-canvas-accent border-t-2 border-t-canvas-accent'
              : 'text-canvas-muted hover:bg-canvas-border'
          }`}
        >
          <LayoutGrid size={12} />
          <span>Canvas</span>
        </button>

        {/* Window tabs */}
        {openWindows.map((item) => {
          const Icon = ICONS[item.type] || Terminal;
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              onClick={() => setActiveId(item.id)}
              className={`flex items-center gap-1.5 px-3 h-full text-xs whitespace-nowrap border-r border-canvas-border transition-colors ${
                isActive
                  ? 'bg-canvas-bg text-canvas-accent border-t-2 border-t-canvas-accent'
                  : 'text-canvas-muted hover:bg-canvas-border'
              }`}
            >
              <Icon size={12} />
              <span>{getCanvasItemTitle(item)}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
