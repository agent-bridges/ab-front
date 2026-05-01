import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useAgentStore } from '../stores/agentStore';
import { useKeyboardStore } from '../stores/keyboardStore';
import {
  Terminal as TerminalIcon,
  FolderOpen,
  StickyNote,
  MapPin,
  X,
  Minus,
  RotateCw,
  ChevronDown,
  ChevronRight,
  ArrowDownUp,
  Plus,
  Columns3,
  Rows3,
  LayoutGrid,
  Cable,
  LayoutList,
  List as ListIcon,
  Eye,
  Pencil,
  Keyboard,
} from 'lucide-react';
import { useCanvasStore } from '../stores/canvasStore';
import TerminalView from '../components/terminal/TerminalView';
import FileBrowserView from '../components/filebrowser/FileBrowserView';
import NotesEditor from '../components/notes/NotesEditor';
import { useNoteViewMode, type NoteViewMode } from '../hooks/useNoteViewMode';
import TunnelsView from '../components/tunnels/TunnelsView';
import { fetchCanvasItems, loadIdePrefs as loadIdePrefsForAgent } from '../api/canvas';
import { forceRefresh as forceTerminalRefresh } from '../components/terminal/TerminalCache';
import ClaudeIcon from '../components/icons/ClaudeIcon';
import CodexIcon from '../components/icons/CodexIcon';
import { getTerminalStatusMeta } from '../components/ProcessIndicator';
import { getCanvasItemTitle } from '../utils/canvasItemTitle';
import ConfirmDialog from '../components/dialogs/ConfirmDialog';
import type { CanvasItem, CanvasItemType, IdeSortMode, IdeGroupLayout, IdeGroup, IdeGroupSizes } from '../types';

const TYPE_LABEL: Record<CanvasItemType, string> = {
  terminal: 'Terminals',
  notes: 'Notes',
  filebrowser: 'Files',
  anchor: 'Anchors',
  tunnels: 'Tunnels',
};

const TYPE_ICON: Record<CanvasItemType, typeof TerminalIcon> = {
  terminal: TerminalIcon,
  notes: StickyNote,
  filebrowser: FolderOpen,
  anchor: MapPin,
  tunnels: Cable,
};

// Section render order for 'type' sort.
const TYPE_ORDER: CanvasItemType[] = ['terminal', 'notes', 'filebrowser', 'anchor', 'tunnels'];

const SORT_LABEL: Record<IdeSortMode, string> = {
  type: 'Type',
  name: 'Name',
  recent: 'Recent',
  status: 'Status',
};

function compareItems(a: CanvasItem, b: CanvasItem, sort: IdeSortMode): number {
  switch (sort) {
    case 'name':
      return getCanvasItemTitle(a).localeCompare(getCanvasItemTitle(b), undefined, { sensitivity: 'base' });
    case 'recent':
      // Higher x/y as a proxy for "more recent" since sessions are appended.
      // Real "recent activity" needs a timestamp on the item, not present yet.
      return (b.id || '').localeCompare(a.id || '');
    case 'status': {
      const aw = a.type === 'terminal' && a.ptyAlive ? 0 : 1;
      const bw = b.type === 'terminal' && b.ptyAlive ? 0 : 1;
      if (aw !== bw) return aw - bw;
      return getCanvasItemTitle(a).localeCompare(getCanvasItemTitle(b));
    }
    default:
      return getCanvasItemTitle(a).localeCompare(getCanvasItemTitle(b));
  }
}

function groupByType(items: CanvasItem[], sort: IdeSortMode): Array<{ type: CanvasItemType; items: CanvasItem[] }> {
  if (sort === 'type') {
    return TYPE_ORDER.map((type) => ({
      type,
      items: items.filter((i) => i.type === type).sort((a, b) => compareItems(a, b, 'name')),
    })).filter((g) => g.items.length > 0);
  }
  // For non-type sorts, render as one flat group.
  const sorted = [...items].sort((a, b) => compareItems(a, b, sort));
  return [{ type: 'terminal', items: sorted }];
}

/**
 * Tiny inline rename input. Commits on Enter/blur, cancels on Escape.
 * Empty/whitespace-only input is treated as cancel so labels can't go blank.
 */
function InlineRename({
  initial,
  onCommit,
  onCancel,
  className,
}: {
  initial: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const commit = () => {
    const v = draft.trim();
    if (!v || v === initial) onCancel();
    else onCommit(v);
  };
  return (
    <input
      ref={ref}
      className={`bg-canvas-bg border border-canvas-accent rounded px-1 py-0 text-canvas-text outline-none ${className ?? ''}`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        // Stop key events from bubbling to canvas-store hotkeys.
        e.stopPropagation();
      }}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}

/** Context menu item; null entries render as separators. */
type CtxItem = { label: string; onClick: () => void; danger?: boolean } | null;

/**
 * Lightweight floating context menu. Positions itself at (x,y) and closes on
 * outside-click or Escape. Caller controls visibility via `open` and `onClose`.
 */
function ContextMenu({
  open,
  x,
  y,
  items,
  onClose,
}: {
  open: boolean;
  x: number;
  y: number;
  items: CtxItem[];
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // Defer the click listener by one frame so the same click that opened the
    // menu doesn't immediately close it.
    const id = window.setTimeout(() => {
      window.addEventListener('mousedown', close);
      window.addEventListener('contextmenu', close);
    }, 0);
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('mousedown', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed z-50 bg-canvas-surface border border-canvas-border rounded shadow-lg py-1 min-w-[160px]"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((it, i) =>
        it === null ? (
          <div key={`sep-${i}`} className="my-1 border-t border-canvas-border" />
        ) : (
          <button
            key={`mi-${i}`}
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-canvas-border ${it.danger ? 'text-red-400 hover:text-red-300' : 'text-canvas-text'}`}
            onClick={() => { it.onClick(); onClose(); }}
          >
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}

function TerminalLeftIcon({ item }: { item: CanvasItem }) {
  if (item.type !== 'terminal') {
    const Icon = TYPE_ICON[item.type];
    return <Icon size={14} className="text-canvas-muted shrink-0" />;
  }
  const meta = getTerminalStatusMeta(item.ptyAlive, item.ptyProcesses, item.aiStatus);
  if (meta?.aiAgent === 'claude') {
    return <ClaudeIcon size={14} className={`shrink-0 ${meta.status === 'ai-busy' ? 'text-orange-400 animate-pulse' : 'text-green-400'}`} />;
  }
  if (meta?.aiAgent === 'codex') {
    return <CodexIcon size={14} className={`shrink-0 ${meta.status === 'ai-busy' ? 'text-orange-400 animate-pulse' : 'text-green-400'}`} />;
  }
  if (meta?.status === 'busy') return <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />;
  if (meta?.status === 'ai-idle' || meta?.status === 'idle') return <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />;
  if (meta?.status === 'dead') return <span className="w-2 h-2 rounded-full bg-neutral-500 shrink-0" />;
  return <TerminalIcon size={14} className="text-canvas-muted shrink-0" />;
}

function ItemBody({ item, noteMode }: { item: CanvasItem; noteMode?: NoteViewMode }) {
  switch (item.type) {
    case 'terminal':
      return (
        <div className="flex-1 min-h-0 bg-canvas-bg">
          <TerminalView item={item} />
        </div>
      );
    case 'notes':
      return (
        <div className="flex-1 min-h-0 overflow-auto bg-canvas-bg p-3">
          <NotesEditor item={item} mode={noteMode} />
        </div>
      );
    case 'filebrowser':
      return (
        <div className="flex-1 min-h-0 overflow-auto bg-canvas-bg">
          <FileBrowserView item={item} />
        </div>
      );
    case 'anchor':
      return (
        <div className="flex-1 min-h-0 flex items-center justify-center text-canvas-muted text-sm">
          <div className="flex flex-col items-center gap-2">
            <MapPin size={32} className="text-canvas-accent" />
            <div>{getCanvasItemTitle(item)}</div>
            <div className="text-xs">Anchor — pan/zoom marker</div>
          </div>
        </div>
      );
    case 'tunnels':
      return (
        <div className="flex-1 min-h-0 bg-canvas-bg">
          <TunnelsView item={item} />
        </div>
      );
  }
}

/**
 * Draggable divider between two tiles. `direction` = the axis of motion:
 * 'col' (vertical line, drag horizontally) or 'row' (horizontal line, drag vertically).
 */
function Divider({
  direction,
  onDrag,
}: {
  direction: 'col' | 'row';
  onDrag: (deltaPx: number) => void;
}) {
  const dragRef = useRef<{ start: number } | null>(null);
  const handleDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { start: direction === 'col' ? e.clientX : e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [direction]);
  const handleMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const cur = direction === 'col' ? e.clientX : e.clientY;
    const delta = cur - dragRef.current.start;
    if (delta !== 0) {
      onDrag(delta);
      dragRef.current.start = cur;
    }
  }, [direction, onDrag]);
  const handleUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  }, []);
  return (
    <div
      className={`${direction === 'col' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'} bg-canvas-border hover:bg-canvas-accent/40 shrink-0`}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
    />
  );
}

/** Carrier MIME for tile drag-and-drop. Custom prefix avoids collisions with
 *  any system DnD source (files, links, plain text). */
const TILE_DRAG_MIME = 'application/x-ab-tile';
/** Carrier MIME for tab-strip reorder DnD. Distinct from TILE_DRAG_MIME so a
 *  tab drag never accidentally triggers the in-group tile-swap path. */
const TAB_DRAG_MIME = 'application/x-ab-tab';

/**
 * One tile inside a multi-tab group. Its own toolbar (refresh / hide / kill)
 * applies to this tile only — same UX as the canvas Window component, but
 * fitted into a tiled cell.
 *
 * When `onSwap` is provided (i.e. the tile lives inside a group), the title
 * bar becomes a drag handle and the tile becomes a drop target. Dropping
 * source A onto target B swaps their positions in `group.members`. The
 * positional sizes (outer/inner) are intentionally NOT moved with the
 * identity, so each tile inherits the slot sizing the user already chose.
 */
function Tile({
  item,
  isActive,
  onActivate,
  onHide,
  onKill,
  onSwap,
}: {
  item: CanvasItem;
  isActive: boolean;
  onActivate: () => void;
  onHide: () => void;
  onKill: () => void;
  /** Provided only inside a group; absent for the solo focused-item view. */
  onSwap?: (srcId: string, dstId: string) => void;
}) {
  const dndEnabled = !!onSwap;
  const [isDragging, setIsDragging] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);
  // Track depth of nested dragenter/leave events so children don't flicker the highlight.
  const dragDepthRef = useRef(0);
  // Per-item view mode for notes (edit ↔ preview). Same hook the canvas Window
  // toolbar uses; localStorage-backed and keyed by item.id so it persists.
  const { mode: noteMode, setMode: setNoteMode } = useNoteViewMode(item.id);

  const handleDragStart = (e: React.DragEvent) => {
    if (!dndEnabled) return;
    e.dataTransfer.setData(TILE_DRAG_MIME, item.id);
    e.dataTransfer.effectAllowed = 'move';
    setIsDragging(true);
  };
  const handleDragEnd = () => {
    setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (!dndEnabled) return;
    if (!Array.from(e.dataTransfer.types).includes(TILE_DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const handleDragEnter = (e: React.DragEvent) => {
    if (!dndEnabled) return;
    if (!Array.from(e.dataTransfer.types).includes(TILE_DRAG_MIME)) return;
    dragDepthRef.current += 1;
    setIsDropTarget(true);
  };
  const handleDragLeave = () => {
    if (!dndEnabled) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDropTarget(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    if (!dndEnabled) return;
    const srcId = e.dataTransfer.getData(TILE_DRAG_MIME);
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDropTarget(false);
    if (srcId && srcId !== item.id) onSwap!(srcId, item.id);
  };

  const borderClass = isDropTarget
    ? 'border-canvas-accent ring-2 ring-canvas-accent/40'
    : isActive
      ? 'border-canvas-accent/40'
      : 'border-canvas-border';
  const opacityClass = isDragging ? 'opacity-40' : '';

  return (
    <div
      // flex-1 is critical: without it the tile collapses to its toolbar's
      // content height and the inner ItemBody (terminal/notes) renders with
      // 0 height — terminal shows just one row of output.
      className={`flex-1 flex flex-col min-w-0 min-h-0 border ${borderClass} ${opacityClass} bg-canvas-bg`}
      onPointerDown={onActivate}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={`flex items-center gap-1 shrink-0 px-2 py-1 border-b border-canvas-border bg-canvas-surface ${dndEnabled ? 'cursor-grab active:cursor-grabbing' : ''}`}
        draggable={dndEnabled}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        title={dndEnabled ? 'Drag to swap with another tile in this group' : undefined}
      >
        <TerminalLeftIcon item={item} />
        <span className="flex-1 truncate text-[10px] text-canvas-muted">
          {getCanvasItemTitle(item, { fullPath: true })}
        </span>
        {item.type === 'terminal' && item.ptyId && (
          <button
            className="p-1 rounded hover:bg-canvas-border text-canvas-muted hover:text-canvas-accent"
            onClick={(e) => { e.stopPropagation(); forceTerminalRefresh(item.ptyId!); }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Force redraw"
          >
            <RotateCw size={11} />
          </button>
        )}
        {item.type === 'notes' && (
          <button
            className="p-1 rounded hover:bg-canvas-border text-canvas-muted hover:text-canvas-text"
            onClick={(e) => { e.stopPropagation(); setNoteMode(noteMode === 'edit' ? 'preview' : 'edit'); }}
            onPointerDown={(e) => e.stopPropagation()}
            title={noteMode === 'edit' ? 'Preview markdown' : 'Edit note'}
          >
            {noteMode === 'edit' ? <Eye size={11} /> : <Pencil size={11} />}
          </button>
        )}
        <button
          className="p-1 rounded hover:bg-canvas-border text-canvas-muted hover:text-canvas-text"
          onClick={(e) => { e.stopPropagation(); onHide(); }}
          onPointerDown={(e) => e.stopPropagation()}
          title="Hide window (keeps the session alive)"
        >
          <Minus size={11} />
        </button>
        <button
          className="p-1 rounded hover:bg-red-500/20 text-canvas-muted hover:text-red-400"
          onClick={(e) => { e.stopPropagation(); onKill(); }}
          onPointerDown={(e) => e.stopPropagation()}
          title="Kill instance"
        >
          <X size={11} />
        </button>
      </div>
      <ItemBody item={item} noteMode={noteMode} />
    </div>
  );
}

const GRID_COLS = 2;

/** Resize two adjacent fractions in `arr` so they still sum to the same total. */
function resizeAdjacent(arr: number[], idx: number, deltaFrac: number): number[] {
  if (idx < 0 || idx + 1 >= arr.length) return arr;
  const min = 0.1;
  const next = [...arr];
  next[idx] = Math.max(min, Math.min(1 - min, (next[idx] ?? 0) + deltaFrac));
  next[idx + 1] = Math.max(min, Math.min(1 - min, (next[idx + 1] ?? 0) - deltaFrac));
  const sum = next.reduce((a, b) => a + b, 0);
  if (sum > 0) for (let i = 0; i < next.length; i++) next[i] = next[i] / sum;
  return next;
}

/** Pad/truncate `arr` to `n` items by spreading 1/n; used for stale persisted sizes. */
function padFractions(arr: number[] | undefined, n: number): number[] {
  if (n <= 0) return [];
  if (!arr || arr.length !== n) return new Array(n).fill(1 / n);
  return arr;
}

/**
 * Arranges N tiles per a chosen layout. Pure presentational; size state and
 * actions live in the parent.
 *
 * Resizing rules:
 *  - v2/v3/h2/h3: a single track of cells, one divider between each adjacent pair.
 *  - grid: rows of GRID_COLS cells. Outer dividers resize whole rows; each row
 *    has its OWN inner col-dividers that resize tiles inside that row only —
 *    the user can drag the divider between cells [0,1] without touching [2,3].
 */
function TileGroup({
  items,
  layout,
  sizes,
  activeId,
  onActivate,
  onHide,
  onKill,
  onResize,
  onSwap,
}: {
  items: CanvasItem[];
  layout: IdeGroupLayout;
  sizes: IdeGroupSizes;
  activeId: string | null;
  onActivate: (id: string) => void;
  onHide: (id: string) => void;
  onKill: (item: CanvasItem) => void;
  onResize: (sizes: IdeGroupSizes) => void;
  onSwap: (srcId: string, dstId: string) => void;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  // For grid: one ref per row so inner-divider drag uses that row's clientWidth.
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);

  const renderTile = (it: CanvasItem) => (
    <Tile
      key={it.id}
      item={it}
      isActive={activeId === it.id}
      onActivate={() => onActivate(it.id)}
      onHide={() => onHide(it.id)}
      onKill={() => onKill(it)}
      onSwap={onSwap}
    />
  );

  // Drag the outer divider at idx (between tracks idx and idx+1).
  // expectedLen = number of outer tracks the render path is using right now,
  // so a stale persisted `sizes.outer` is silently re-padded to match.
  const dragOuter = useCallback((idx: number, deltaPx: number, axis: 'col' | 'row', expectedLen: number) => {
    const el = outerRef.current;
    if (!el) return;
    const total = axis === 'col' ? el.clientWidth : el.clientHeight;
    if (total <= 0) return;
    const deltaFrac = deltaPx / total;
    const outer = padFractions(sizes.outer, expectedLen);
    onResize({ ...sizes, outer: resizeAdjacent(outer, idx, deltaFrac) });
  }, [sizes, onResize]);

  // Drag the inner divider at colIdx inside row rowIdx (grid only).
  const dragInner = useCallback((rowIdx: number, colIdx: number, deltaPx: number, expectedLen: number) => {
    const el = rowRefs.current[rowIdx];
    if (!el) return;
    const total = el.clientWidth;
    if (total <= 0) return;
    const deltaFrac = deltaPx / total;
    const inner = sizes.inner ? sizes.inner.map((r) => [...r]) : [];
    inner[rowIdx] = resizeAdjacent(padFractions(inner[rowIdx], expectedLen), colIdx, deltaFrac);
    onResize({ ...sizes, inner });
  }, [sizes, onResize]);

  if (items.length === 0) return null;
  if (items.length === 1 || layout === 'single') {
    return <div className="flex-1 min-h-0 flex">{renderTile(items[0])}</div>;
  }

  // Single-track: v2/v3 (columns) and h2/h3 (rows).
  if (layout === 'v2' || layout === 'v3' || layout === 'h2' || layout === 'h3') {
    const isCol = layout === 'v2' || layout === 'v3';
    const outer = padFractions(sizes.outer, items.length);
    return (
      <div ref={outerRef} className={`flex-1 min-h-0 flex ${isCol ? '' : 'flex-col'}`}>
        {items.map((it, i) => (
          <Fragment key={`cell-${it.id}`}>
            <div className="flex flex-col min-w-0 min-h-0" style={{ flex: `${outer[i]} 1 0` }}>
              {renderTile(it)}
            </div>
            {i < items.length - 1 && (
              <Divider direction={isCol ? 'col' : 'row'} onDrag={(d) => dragOuter(i, d, isCol ? 'col' : 'row', items.length)} />
            )}
          </Fragment>
        ))}
      </div>
    );
  }

  // Grid: rows-of-columns. Outer = row heights; inner[r] = col widths in row r.
  const rowsCount = Math.ceil(items.length / GRID_COLS);
  const rows: CanvasItem[][] = [];
  for (let r = 0; r < rowsCount; r++) {
    rows.push(items.slice(r * GRID_COLS, r * GRID_COLS + GRID_COLS));
  }
  const outer = padFractions(sizes.outer, rowsCount);
  const innerSafe: number[][] = rows.map((row, r) => padFractions(sizes.inner?.[r], row.length));
  return (
    <div ref={outerRef} className="flex-1 min-h-0 flex flex-col">
      {rows.map((rowItems, rowIdx) => (
        <Fragment key={`row-${rowIdx}`}>
          <div
            ref={(el) => { rowRefs.current[rowIdx] = el; }}
            className="flex min-w-0 min-h-0"
            style={{ flex: `${outer[rowIdx]} 1 0` }}
          >
            {rowItems.map((it, colIdx) => (
              <Fragment key={`cell-${it.id}`}>
                <div className="flex flex-col min-w-0 min-h-0" style={{ flex: `${innerSafe[rowIdx][colIdx]} 1 0` }}>
                  {renderTile(it)}
                </div>
                {colIdx < rowItems.length - 1 && (
                  <Divider direction="col" onDrag={(d) => dragInner(rowIdx, colIdx, d, rowItems.length)} />
                )}
              </Fragment>
            ))}
          </div>
          {rowIdx < rows.length - 1 && (
            <Divider direction="row" onDrag={(d) => dragOuter(rowIdx, d, 'row', rowsCount)} />
          )}
        </Fragment>
      ))}
    </div>
  );
}

/**
 * Renders one IdeGroup: toolbar (rename / +member / layout / delete) + TileGroup.
 * Members that no longer exist (e.g. session was killed elsewhere) are filtered
 * out of the render — but stay in the group state until the user adjusts it.
 *
 * Strict isolation note: every action this component fires writes to IDE-scoped
 * state ONLY (renameIdeGroup / setGroupLayout / setGroupSizes / addMemberToGroup
 * / removeMemberFromGroup). It NEVER touches canvas state (panX/Y, zoom, items'
 * window/pinned/etc.) and NEVER calls canvas tile/zoom actions.
 */
function GroupView({
  group,
  allItems,
  onRename,
  onDelete,
  onSetLayout,
  onSetSizes,
  onAddMember,
  onRemoveMember,
  onKillMember,
  onSwapMembers,
}: {
  group: IdeGroup;
  allItems: CanvasItem[];
  onRename: (name: string) => void;
  onDelete: () => void;
  onSetLayout: (layout: IdeGroupLayout) => void;
  onSetSizes: (sizes: IdeGroupSizes) => void;
  onAddMember: (itemId: string) => void;
  onRemoveMember: (itemId: string) => void;
  onKillMember: (item: CanvasItem) => void;
  onSwapMembers: (srcId: string, dstId: string) => void;
}) {
  // Hydrate members → items (filter orphans).
  const members = useMemo(
    () => group.members
      .map((id) => allItems.find((i) => i.id === id))
      .filter((i): i is CanvasItem => i !== undefined),
    [group.members, allItems],
  );
  const cells = members.length;

  const candidates = useMemo(
    () => allItems.filter((i) => !group.members.includes(i.id)),
    [allItems, group.members],
  );

  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState(group.name);
  useEffect(() => { setRenameDraft(group.name); }, [group.name]);
  const renameInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renaming) renameInputRef.current?.select();
  }, [renaming]);

  const [addOpen, setAddOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Layout buttons depend on cell count.
  const colsLayout: IdeGroupLayout | null = cells === 2 ? 'v2' : cells === 3 ? 'v3' : null;
  const rowsLayout: IdeGroupLayout | null = cells === 2 ? 'h2' : cells === 3 ? 'h3' : null;
  const gridLayout: IdeGroupLayout | null = cells >= 4 ? 'grid' : null;
  const btn = (active: boolean) =>
    `p-1 rounded shrink-0 ${active ? 'bg-canvas-accent/20 text-canvas-accent' : 'text-canvas-muted hover:bg-canvas-border hover:text-canvas-text'}`;

  // TileGroup pads/normalizes sizes internally; just pass through.
  const [activeMemberId, setActiveMemberId] = useState<string | null>(members[0]?.id ?? null);
  useEffect(() => {
    // Keep activeMemberId valid as members come and go.
    if (!activeMemberId || !members.some((m) => m.id === activeMemberId)) {
      setActiveMemberId(members[0]?.id ?? null);
    }
  }, [members, activeMemberId]);

  const commitRename = () => {
    const name = renameDraft.trim();
    if (name && name !== group.name) onRename(name);
    setRenaming(false);
  };

  return (
    <>
      {/* Group toolbar */}
      <div className="flex items-center gap-1 shrink-0 px-2 py-1 border-b border-canvas-border bg-canvas-surface">
        <LayoutGrid size={12} className="text-canvas-accent shrink-0" />
        {renaming ? (
          <input
            ref={renameInputRef}
            className="text-xs bg-canvas-bg border border-canvas-border rounded px-1 py-0.5 text-canvas-text outline-none focus:border-canvas-accent"
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') { setRenameDraft(group.name); setRenaming(false); }
            }}
          />
        ) : (
          <button
            className="text-xs text-canvas-text hover:text-canvas-accent truncate max-w-[200px]"
            onClick={() => setRenaming(true)}
            title="Click to rename group"
          >
            {group.name}
          </button>
        )}
        <span className="text-[10px] text-canvas-muted shrink-0">({cells})</span>

        <div className="w-px h-4 bg-canvas-border mx-1" />

        {colsLayout && (
          <button className={btn(group.layout === colsLayout)} onClick={() => onSetLayout(colsLayout)} title="Tile columns">
            <Columns3 size={14} />
          </button>
        )}
        {rowsLayout && (
          <button className={btn(group.layout === rowsLayout)} onClick={() => onSetLayout(rowsLayout)} title="Tile rows">
            <Rows3 size={14} />
          </button>
        )}
        {gridLayout && (
          <button className={btn(group.layout === gridLayout)} onClick={() => onSetLayout(gridLayout)} title="Tile grid">
            <LayoutGrid size={14} />
          </button>
        )}

        <div className="ml-auto flex items-center gap-1 relative">
          <button
            className="p-1 rounded text-canvas-muted hover:bg-canvas-border hover:text-canvas-text"
            onClick={() => setAddOpen((v) => !v)}
            title="Add member"
            disabled={candidates.length === 0}
          >
            <Plus size={14} />
          </button>
          {addOpen && candidates.length > 0 && (
            <div className="absolute right-0 top-7 z-20 bg-canvas-surface border border-canvas-border rounded shadow-lg py-1 min-w-[200px] max-h-[300px] overflow-y-auto">
              {candidates.map((it) => (
                <button
                  key={it.id}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left hover:bg-canvas-border text-canvas-text"
                  onClick={() => { onAddMember(it.id); setAddOpen(false); }}
                >
                  <TerminalLeftIcon item={it} />
                  <span className="truncate">{getCanvasItemTitle(it)}</span>
                </button>
              ))}
            </div>
          )}
          <button
            className="p-1 rounded text-canvas-muted hover:bg-red-500/20 hover:text-red-400"
            onClick={() => setConfirmDelete(true)}
            title="Delete group (members are not killed)"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Group body */}
      {cells === 0 ? (
        <div className="flex-1 flex items-center justify-center text-canvas-muted text-sm">
          <div className="text-center">
            <div className="mb-2">Empty group</div>
            <div className="text-xs">Click + above to add members.</div>
          </div>
        </div>
      ) : (
        <TileGroup
          items={members}
          layout={group.layout}
          sizes={group.sizes}
          activeId={activeMemberId}
          onActivate={(id) => setActiveMemberId(id)}
          onHide={(id) => onRemoveMember(id)}
          onKill={(it) => onKillMember(it)}
          onResize={onSetSizes}
          onSwap={onSwapMembers}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete group "${group.name}"?`}
        message="This removes the group container. Member sessions are NOT killed and remain on the canvas."
        confirmLabel="Delete"
        confirmTone="danger"
        onConfirm={() => { onDelete(); setConfirmDelete(false); }}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}

export default function IdeLayout() {
  const items = useCanvasStore((s) => s.items);
  const sort = useCanvasStore((s) => s.ideSort);
  const sidebarWidth = useCanvasStore((s) => s.ideSidebarWidth);
  const openTabIds = useCanvasStore((s) => s.ideOpenTabIds);
  const focusedItemId = useCanvasStore((s) => s.ideFocusedItemId);
  const ideGroups = useCanvasStore((s) => s.ideGroups);

  const setIdeSort = useCanvasStore((s) => s.setIdeSort);
  const setIdeSidebarWidth = useCanvasStore((s) => s.setIdeSidebarWidth);
  const openIdeTab = useCanvasStore((s) => s.openIdeTab);
  const closeIdeTab = useCanvasStore((s) => s.closeIdeTab);
  const setIdeFocusedItem = useCanvasStore((s) => s.setIdeFocusedItem);
  const createIdeGroup = useCanvasStore((s) => s.createIdeGroup);
  const deleteIdeGroup = useCanvasStore((s) => s.deleteIdeGroup);
  const renameIdeGroup = useCanvasStore((s) => s.renameIdeGroup);
  const addMemberToGroup = useCanvasStore((s) => s.addMemberToGroup);
  const removeMemberFromGroup = useCanvasStore((s) => s.removeMemberFromGroup);
  const swapGroupMembers = useCanvasStore((s) => s.swapGroupMembers);
  const reorderIdeTab = useCanvasStore((s) => s.reorderIdeTab);
  const setGroupLayout = useCanvasStore((s) => s.setGroupLayout);
  const setGroupSizes = useCanvasStore((s) => s.setGroupSizes);
  const addItem = useCanvasStore((s) => s.addItem);
  const removeItem = useCanvasStore((s) => s.removeItem);
  const updateItem = useCanvasStore((s) => s.updateItem);
  const agents = useAgentStore((s) => s.agents);
  const currentAgentId = useAgentStore((s) => s.currentAgentId);
  const setCurrentAgent = useAgentStore((s) => s.setCurrentAgent);
  // Floating-keyboard + scroll-bar paired toggle for the IDE sidebar header.
  // ON if either widget is currently visible; clicking flips both to the
  // opposite of the current ON state — so one tap on iPad shows or hides
  // the whole touch-control set.
  const kbVisible = useKeyboardStore((s) => s.keyboard.visible);
  const scrollVisible = useKeyboardStore((s) => s.scroll.visible);
  const setKeyboardVisible = useKeyboardStore((s) => s.setKeyboardVisible);
  const setScrollVisible = useKeyboardStore((s) => s.setScrollVisible);
  const touchKeysOn = kbVisible || scrollVisible;

  // Rename state. `editing` identifies which entry is in inline-edit mode.
  // The same id can appear in two visual locations (tab strip + sidebar);
  // `scope` disambiguates so only the originally double-clicked / context-
  // menu-targeted instance shows the input. id format: 'group:xxx' or item id.
  const [editing, setEditing] = useState<{ id: string; scope: 'tab' | 'sidebar' } | null>(null);
  // Right-click context menu state. `forId` matches a sidebar entry id; the
  // visible items in the menu depend on whether forId is a group or an item.
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; forId: string } | null>(null);

  // Tab DnD state. `draggingId` is the tab being moved (so we can dim it);
  // `dropTarget` is the tab + side currently under the cursor (drives the
  // accent-colored insertion cue). `dropTarget.id === null` means "after the
  // last tab" (the end-of-strip dropzone).
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [tabDropTarget, setTabDropTarget] = useState<{ id: string | null; side: 'before' | 'after' } | null>(null);

  // Single rename dispatcher: groups vs canvas items go to different actions.
  const commitRename = useCallback((id: string, name: string) => {
    if (id.startsWith('group:')) renameIdeGroup(id, name);
    else updateItem(id, { label: name });
    setEditing(null);
  }, [renameIdeGroup, updateItem]);

  // Index groups by id for cheap lookups.
  const groupsById = useMemo(() => {
    const m = new Map<string, IdeGroup>();
    for (const g of ideGroups) m.set(g.id, g);
    return m;
  }, [ideGroups]);

  const isGroupId = (id: string) => id.startsWith('group:');
  const tabExists = useCallback((id: string) => isGroupId(id) ? groupsById.has(id) : items.some((i) => i.id === id), [groupsById, items]);

  // Auto-focus the first alive terminal if nothing focused or focused entity gone.
  useEffect(() => {
    if (focusedItemId && tabExists(focusedItemId)) return;
    const alive = items.find((i) => i.type === 'terminal' && i.ptyAlive);
    if (alive) { openIdeTab(alive.id); return; }
    if (items.length > 0) openIdeTab(items[0].id);
  }, [items, focusedItemId, openIdeTab, tabExists]);

  const itemSections = useMemo(() => groupByType(items, sort), [items, sort]);

  // The currently focused entity: either an item, a group, or nothing.
  const focusedItem = useMemo(
    () => focusedItemId && !isGroupId(focusedItemId) ? items.find((i) => i.id === focusedItemId) ?? null : null,
    [items, focusedItemId],
  );
  const focusedGroup = useMemo(
    () => focusedItemId && isGroupId(focusedItemId) ? groupsById.get(focusedItemId) ?? null : null,
    [groupsById, focusedItemId],
  );

  // Tabs: derive from openTabIds, in order. Each entry is either an item or a group.
  type Tab = { id: string; kind: 'item'; item: CanvasItem } | { id: string; kind: 'group'; group: IdeGroup };
  const tabs: Tab[] = useMemo(() => openTabIds.flatMap((id): Tab[] => {
    if (isGroupId(id)) {
      const g = groupsById.get(id);
      return g ? [{ id, kind: 'group', group: g }] : [];
    }
    const item = items.find((i) => i.id === id);
    return item ? [{ id, kind: 'item', item }] : [];
  }), [openTabIds, items, groupsById]);

  // Collapsed sections (per-render, not persisted in v1).
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Sidebar resize.
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const onResizeDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: sidebarWidth };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [sidebarWidth]);
  const onResizeMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const next = dragRef.current.startW + (e.clientX - dragRef.current.startX);
    setIdeSidebarWidth(next);
  }, [setIdeSidebarWidth]);
  const onResizeUp = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
  }, []);

  // Sort dropdown.
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  // Kill-confirmation dialog (reusable ConfirmDialog instead of native confirm()).
  const [killCandidate, setKillCandidate] = useState<CanvasItem | null>(null);
  const [killBusy, setKillBusy] = useState(false);

  // ===== Multi-agent expandable tree =====
  // Set of agent ids that the user has expanded in the sidebar. The CURRENT
  // agent is auto-included. Persisted globally per-browser so the user's
  // mental model survives reloads and agent switches.
  const [expandedAgentIds, setExpandedAgentIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('canvas-ide-expanded-agents');
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch { /* noop */ }
    return new Set();
  });
  useEffect(() => {
    localStorage.setItem('canvas-ide-expanded-agents', JSON.stringify([...expandedAgentIds]));
  }, [expandedAgentIds]);
  // Current agent is always implicitly expanded; merge it in when it changes.
  useEffect(() => {
    if (!currentAgentId) return;
    setExpandedAgentIds((prev) => prev.has(currentAgentId) ? prev : new Set([...prev, currentAgentId]));
  }, [currentAgentId]);

  // Flat-mode toggle: hide type-grouping section headers (GROUPS/TERMINALS/...)
  // under each expanded agent and render items as a flat list. Persisted.
  const [flatMode, setFlatMode] = useState<boolean>(() => localStorage.getItem('canvas-ide-flat-mode') === '1');
  useEffect(() => {
    localStorage.setItem('canvas-ide-flat-mode', flatMode ? '1' : '0');
  }, [flatMode]);

  // Per-agent cache for non-current expanded agents (items + groups). The
  // current agent uses live store state; non-current agents are fetched once
  // when expanded and cached here. Manual refresh via right-click clears the
  // entry so the next render re-fetches.
  const [agentDataCache, setAgentDataCache] = useState<Record<string, { items: CanvasItem[]; groups: IdeGroup[]; loadedAt: number } | { error: string }>>({});

  // Fetch on expand: any agent that is in the expanded set, is not current,
  // and has no cache entry triggers a one-shot fetch.
  useEffect(() => {
    let cancelled = false;
    for (const agentId of expandedAgentIds) {
      if (agentId === currentAgentId) continue;
      if (agentDataCache[agentId]) continue;
      (async () => {
        try {
          const fetched = await fetchCanvasItems(agentId);
          if (cancelled) return;
          const prefs = loadIdePrefsForAgent(agentId);
          setAgentDataCache((prev) => ({ ...prev, [agentId]: { items: fetched, groups: prefs.groups, loadedAt: Date.now() } }));
        } catch (e) {
          if (cancelled) return;
          setAgentDataCache((prev) => ({ ...prev, [agentId]: { error: e instanceof Error ? e.message : String(e) } }));
        }
      })();
    }
    return () => { cancelled = true; };
  }, [expandedAgentIds, currentAgentId, agentDataCache]);

  // Click-through: clicking an item in a non-current agent's subtree should
  // (1) switch current to that agent, (2) wait until items are loaded, then
  // (3) open the requested tab. We can't openIdeTab synchronously because the
  // store's items list still belongs to the previous agent at click time.
  const [pendingNavigation, setPendingNavigation] = useState<{ agentId: string; itemId: string } | null>(null);
  useEffect(() => {
    if (!pendingNavigation) return;
    if (pendingNavigation.agentId !== currentAgentId) return;
    if (items.some((i) => i.id === pendingNavigation.itemId)) {
      openIdeTab(pendingNavigation.itemId);
      setPendingNavigation(null);
    }
  }, [pendingNavigation, currentAgentId, items, openIdeTab]);

  const toggleAgentExpanded = useCallback((agentId: string) => {
    setExpandedAgentIds((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId);
      else next.add(agentId);
      return next;
    });
  }, []);

  return (
    <div className="absolute inset-0 flex bg-canvas-bg">
      {/* Sidebar */}
      <div
        className="flex flex-col border-r border-canvas-border bg-canvas-surface min-h-0"
        style={{ width: sidebarWidth }}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-canvas-border shrink-0">
          <span className="text-xs uppercase tracking-wider text-canvas-muted flex-1">Explorer</span>
          <div className="relative">
            <button
              className="p-1 rounded hover:bg-canvas-border text-canvas-muted"
              onClick={() => setSortMenuOpen((v) => !v)}
              title={`Sort: ${SORT_LABEL[sort]}`}
            >
              <ArrowDownUp size={12} />
            </button>
            {sortMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 bg-canvas-surface border border-canvas-border rounded shadow-lg py-1 min-w-[120px]">
                {(Object.keys(SORT_LABEL) as IdeSortMode[]).map((s) => (
                  <button
                    key={s}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-canvas-border ${s === sort ? 'text-canvas-accent' : 'text-canvas-text'}`}
                    onClick={() => { setIdeSort(s); setSortMenuOpen(false); }}
                  >
                    {SORT_LABEL[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className={`p-1 rounded text-canvas-muted ${flatMode ? 'bg-canvas-accent/20 text-canvas-accent' : 'hover:bg-canvas-border'}`}
            title={flatMode ? 'Type-grouping: OFF (flat list). Click to group by type.' : 'Type-grouping: ON (sections by type). Click to flatten.'}
            onClick={() => setFlatMode((v) => !v)}
          >
            {flatMode ? <ListIcon size={12} /> : <LayoutList size={12} />}
          </button>
          <button
            className={`p-1 rounded text-canvas-muted ${touchKeysOn ? 'bg-canvas-accent/20 text-canvas-accent' : 'hover:bg-canvas-border'}`}
            title={touchKeysOn ? 'Touch keys: ON (keyboard + scroll). Click to hide both.' : 'Touch keys: OFF. Click to show floating keyboard + scroll bar.'}
            onClick={() => {
              const next = !touchKeysOn;
              setKeyboardVisible(next);
              setScrollVisible(next);
            }}
          >
            <Keyboard size={12} />
          </button>
          <button
            className="p-1 rounded hover:bg-canvas-border text-canvas-muted"
            title="New terminal"
            onClick={() => {
              const id = addItem('terminal', 0, 0);
              openIdeTab(id);
            }}
          >
            <Plus size={12} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {/* The sidebar tree is rooted by PTY daemon connection (= agent).
              Each agent registered in the back is a tree root row. Only the
              CURRENT agent is expanded and shows the Groups + items-by-type
              subtree below. Clicking a collapsed agent row switches the
              active agent (same effect as the Toolbar's agent dropdown) —
              that one becomes the new expanded root, the previous current
              collapses. */}
          {(() => {
            // Render the subtree (groups + items, optionally type-grouped)
            // for one agent. Parameterised so we can use it for the current
            // agent (live store data) AND non-current expanded agents (data
            // fetched into agentDataCache).
            //
            // - `agentItems` / `agentGroups` are the data to render.
            // - `isCurrent` controls whether interactions go to the live
            //   store (current) or first switch the current agent.
            const renderAgentSubtree = (
              agentId: string,
              agentItems: CanvasItem[],
              agentGroups: IdeGroup[],
              isCurrent: boolean,
            ): ReactElement => {
              // Click handler for any item/group row inside this subtree.
              const handleSelect = (id: string) => {
                if (isCurrent) {
                  openIdeTab(id);
                } else {
                  // Switch to this agent and queue the click-through. The
                  // pendingNavigation effect will fire openIdeTab once items
                  // are loaded for the new current agent. Group ids start
                  // with `group:` and live in IdePrefs (already loaded by
                  // setCurrentAgent), but items are async — same path is
                  // safe for both.
                  setCurrentAgent(agentId);
                  setPendingNavigation({ agentId, itemId: id });
                }
              };

              // Render mode: type-grouped (default) vs flat list.
              // groupByType returns a flat single-section when sort != 'type';
              // we still use it but skip the header in flatMode.
              const sections = groupByType(agentItems, sort);
              const showTypeHeaders = !flatMode && sort === 'type';
              const showGroupsHeader = !flatMode;

              const groupRows = agentGroups.map((g) => {
                // Подсветка фокуса работает в том суб-дереве, где живёт фокус.
                // Сейчас фокус хранится только для current agent'а, так что
                // эффективно подсвечивается строка в его субдереве. Если
                // потом сделаем cross-agent tabs — расширим focusedItem-shape.
                const isFocused = isCurrent && focusedItemId === g.id;
                const isEditing = isCurrent && editing?.id === g.id && editing.scope === 'sidebar';
                return (
                  <div
                    key={g.id}
                    role="button"
                    tabIndex={0}
                    className={`w-full flex items-center gap-2 pl-5 pr-3 py-1 text-xs text-left transition-colors cursor-pointer ${
                      isFocused ? 'bg-white/10 text-canvas-text' : 'text-canvas-text hover:bg-canvas-border'
                    }`}
                    onClick={() => { if (!isEditing) handleSelect(g.id); }}
                    onContextMenu={(e) => {
                      if (!isCurrent) return;
                      e.preventDefault();
                      setCtxMenu({ x: e.clientX, y: e.clientY, forId: g.id });
                    }}
                    title={`${g.name} — ${g.members.length} members`}
                  >
                    <LayoutGrid size={12} className="text-canvas-accent shrink-0" />
                    {isEditing ? (
                      <InlineRename
                        initial={g.name}
                        onCommit={(next) => commitRename(g.id, next)}
                        onCancel={() => setEditing(null)}
                        className="text-xs flex-1 min-w-0"
                      />
                    ) : (
                      <>
                        <span className="truncate flex-1">{g.name}</span>
                        <span className="text-[9px] opacity-60">{g.members.length}</span>
                      </>
                    )}
                  </div>
                );
              });

              const itemRow = (item: CanvasItem) => {
                const isFocused = isCurrent && focusedItemId === item.id;
                const isEditing = isCurrent && editing?.id === item.id && editing.scope === 'sidebar';
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    className={`w-full flex items-center gap-2 pl-5 pr-3 py-1 text-xs text-left transition-colors cursor-pointer ${
                      isFocused
                        ? 'bg-white/10 text-canvas-text'
                        : 'text-canvas-text hover:bg-canvas-border'
                    }`}
                    onClick={() => { if (!isEditing) handleSelect(item.id); }}
                    onContextMenu={(e) => {
                      if (!isCurrent) return;
                      e.preventDefault();
                      setCtxMenu({ x: e.clientX, y: e.clientY, forId: item.id });
                    }}
                    title={getCanvasItemTitle(item, { fullPath: true })}
                  >
                    <TerminalLeftIcon item={item} />
                    {isEditing ? (
                      <InlineRename
                        initial={getCanvasItemTitle(item)}
                        onCommit={(next) => commitRename(item.id, next)}
                        onCancel={() => setEditing(null)}
                        className="text-xs flex-1 min-w-0"
                      />
                    ) : (
                      <>
                        <span className="truncate flex-1">{getCanvasItemTitle(item)}</span>
                        {item.pinned && <span className="text-[9px] text-canvas-accent" title="Pinned">📌</span>}
                        {item.window?.locked && <span className="text-[9px] text-canvas-muted" title="Locked">🔒</span>}
                      </>
                    )}
                  </div>
                );
              };

              return (
                <div key={`subtree-${agentId}`}>
                  {/* Groups */}
                  {showGroupsHeader && (
                    <div className="flex items-center gap-1 px-3 py-1 text-[10px] uppercase tracking-wider text-canvas-muted">
                      <span className="flex-1">Groups</span>
                      <span className="opacity-60 mr-1">{agentGroups.length}</span>
                      {isCurrent && (
                        <button
                          className="p-0.5 rounded hover:bg-canvas-border hover:text-canvas-text"
                          title="New empty group"
                          onClick={() => createIdeGroup([])}
                        >
                          <Plus size={10} />
                        </button>
                      )}
                    </div>
                  )}
                  {groupRows}
                  {showGroupsHeader && agentGroups.length === 0 && (
                    <div className="pl-5 pr-3 py-1 text-[10px] text-canvas-muted italic">No groups</div>
                  )}

                  {/* Items — type-grouped or flat */}
                  {sections.map((section) => (
                    <div key={section.type}>
                      {showTypeHeaders && (
                        <button
                          className="w-full flex items-center gap-1 px-3 py-1 text-[10px] uppercase tracking-wider text-canvas-muted hover:text-canvas-text"
                          onClick={() => setCollapsed((c) => ({ ...c, [`${agentId}:${section.type}`]: !c[`${agentId}:${section.type}`] }))}
                        >
                          {collapsed[`${agentId}:${section.type}`] ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                          <span>{TYPE_LABEL[section.type]}</span>
                          <span className="ml-1 opacity-60">{section.items.length}</span>
                        </button>
                      )}
                      {(!showTypeHeaders || !collapsed[`${agentId}:${section.type}`]) && section.items.map(itemRow)}
                    </div>
                  ))}
                  {agentItems.length === 0 && (
                    <div className="px-3 py-2 text-[10px] text-canvas-muted italic">No items.</div>
                  )}
                </div>
              );
            };

            // The agent rows. Each agent is a top-level chevron-row; expanded
            // agents render their subtree below. Chevron toggles expand only;
            // clicking the name sets-current AND ensures expanded.
            const rows: ReactElement[] = [];
            for (const agent of agents) {
              const isCurrent = agent.id === currentAgentId;
              const isExpanded = expandedAgentIds.has(agent.id);

              // Resolve agent-scoped data.
              let subtreeNode: ReactElement | null = null;
              if (isExpanded) {
                if (isCurrent) {
                  subtreeNode = renderAgentSubtree(agent.id, items, ideGroups, true);
                } else {
                  const cached = agentDataCache[agent.id];
                  if (!cached) {
                    subtreeNode = (
                      <div key={`loading-${agent.id}`} className="pl-5 pr-3 py-1 text-[10px] text-canvas-muted italic">Loading…</div>
                    );
                  } else if ('error' in cached) {
                    subtreeNode = (
                      <div key={`err-${agent.id}`} className="mx-2 my-1 px-2 py-1 text-[10px] text-red-300 bg-red-500/10 rounded">{cached.error}</div>
                    );
                  } else {
                    subtreeNode = renderAgentSubtree(agent.id, cached.items, cached.groups, false);
                  }
                }
              }

              rows.push(
                <div key={agent.id}>
                  <div
                    className={`w-full flex items-center gap-1.5 pl-1.5 pr-2 py-1.5 text-sm font-medium text-left transition-colors border-l-2 ${
                      isCurrent
                        ? 'bg-canvas-accent/30 text-canvas-text border-canvas-accent shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)]'
                        : 'bg-canvas-border/30 text-canvas-text border-transparent hover:bg-canvas-border hover:border-canvas-muted'
                    }`}
                  >
                    <button
                      className="p-0.5 rounded text-canvas-muted hover:bg-canvas-border hover:text-canvas-text shrink-0"
                      onClick={(e) => { e.stopPropagation(); toggleAgentExpanded(agent.id); }}
                      title={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded
                        ? <ChevronDown size={14} />
                        : <ChevronRight size={14} />}
                    </button>
                    <span
                      role="button"
                      tabIndex={0}
                      className="truncate flex-1 cursor-pointer"
                      onClick={() => {
                        if (!isCurrent) setCurrentAgent(agent.id);
                        if (!isExpanded) toggleAgentExpanded(agent.id);
                      }}
                      title={`${agent.name} — ${agent.ip}\nClick name to make current. Chevron expands without switching.`}
                    >
                      {agent.name}
                    </span>
                    {isCurrent && <span className="text-[10px] text-canvas-accent shrink-0" title="Current connection">●</span>}
                  </div>
                  {subtreeNode}
                </div>,
              );
            }
            if (agents.length === 0) {
              rows.push(
                <div key="__no-agents__" className="px-3 py-3 text-xs text-canvas-muted">
                  No PTY daemon connections. Add one in Settings.
                </div>,
              );
            }
            return rows;
          })()}
        </div>
      </div>

      {/* Resize handle */}
      <div
        className="w-1 cursor-col-resize bg-transparent hover:bg-canvas-accent/30"
        onPointerDown={onResizeDown}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
      />

      {/* Main pane */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Tab strip — heterogeneous: tabs may be items or groups.
            Each tab is draggable (HTML5 DnD, MIME application/x-ab-tab) and
            also a drop target. Cursor X relative to the tab's box picks the
            insertion side; a 2px accent-colored bar on that edge previews the
            drop. The flex-1 trailing dropzone catches drops past the last
            tab so users can move a tab to the very end. The MIME is distinct
            from TILE_DRAG_MIME so reordering tabs never collides with the
            in-group tile-swap DnD. */}
        <div className="flex items-stretch shrink-0 border-b border-canvas-border bg-canvas-surface overflow-x-auto">
          {tabs.length === 0 && (
            <div className="px-3 py-2 text-xs text-canvas-muted">No open tabs</div>
          )}
          {tabs.map((tab) => {
            const isActive = focusedItemId === tab.id;
            const label = tab.kind === 'item' ? getCanvasItemTitle(tab.item) : tab.group.name;
            const fullTitle = tab.kind === 'item'
              ? getCanvasItemTitle(tab.item, { fullPath: true })
              : `${tab.group.name} — ${tab.group.members.length} member(s)`;
            const isEditing = editing?.id === tab.id && editing.scope === 'tab';
            const isDragging = draggingTabId === tab.id;
            const dropOnThis = tabDropTarget?.id === tab.id ? tabDropTarget.side : null;
            return (
              <div
                key={tab.id}
                className={`relative group/tab flex items-center gap-2 px-3 py-1.5 text-xs border-r border-canvas-border cursor-pointer ${
                  isActive ? 'bg-canvas-bg text-canvas-text' : 'text-canvas-muted hover:bg-canvas-border/50'
                } ${isDragging ? 'opacity-40' : ''}`}
                draggable={!isEditing}
                onDragStart={(e) => {
                  if (isEditing) { e.preventDefault(); return; }
                  e.dataTransfer.setData(TAB_DRAG_MIME, tab.id);
                  e.dataTransfer.effectAllowed = 'move';
                  setDraggingTabId(tab.id);
                }}
                onDragEnd={() => {
                  setDraggingTabId(null);
                  setTabDropTarget(null);
                }}
                onDragOver={(e) => {
                  if (!Array.from(e.dataTransfer.types).includes(TAB_DRAG_MIME)) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const side: 'before' | 'after' = (e.clientX - rect.left) < rect.width / 2 ? 'before' : 'after';
                  if (tabDropTarget?.id !== tab.id || tabDropTarget?.side !== side) {
                    setTabDropTarget({ id: tab.id, side });
                  }
                }}
                onDragLeave={(e) => {
                  // Only clear if we're leaving the tab box itself (not entering a child).
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
                    if (tabDropTarget?.id === tab.id) setTabDropTarget(null);
                  }
                }}
                onDrop={(e) => {
                  if (!Array.from(e.dataTransfer.types).includes(TAB_DRAG_MIME)) return;
                  e.preventDefault();
                  const srcId = e.dataTransfer.getData(TAB_DRAG_MIME);
                  const target = tabDropTarget;
                  setTabDropTarget(null);
                  setDraggingTabId(null);
                  if (srcId && target) reorderIdeTab(srcId, tab.id, target.side);
                }}
                onClick={() => { if (!isEditing) setIdeFocusedItem(tab.id); }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditing({ id: tab.id, scope: 'tab' });
                }}
                onAuxClick={(e) => { if (e.button === 1) closeIdeTab(tab.id); }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setCtxMenu({ x: e.clientX, y: e.clientY, forId: tab.id });
                }}
                title={`${fullTitle} — click=focus, drag=reorder, double-click=rename, right-click=menu, middle-click=close`}
              >
                {/* Drop-side cue */}
                {dropOnThis === 'before' && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-canvas-accent pointer-events-none" />}
                {dropOnThis === 'after' && <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-canvas-accent pointer-events-none" />}

                {tab.kind === 'item'
                  ? <TerminalLeftIcon item={tab.item} />
                  : <LayoutGrid size={12} className="text-canvas-accent shrink-0" />}
                {isEditing ? (
                  <InlineRename
                    initial={label}
                    onCommit={(next) => commitRename(tab.id, next)}
                    onCancel={() => setEditing(null)}
                    className="text-xs max-w-[200px]"
                  />
                ) : (
                  <span className="max-w-[160px] truncate">{label}</span>
                )}
                {tab.kind === 'group' && !isEditing && (
                  <span className="text-[9px] text-canvas-accent shrink-0">×{tab.group.members.length}</span>
                )}
                <button
                  className="opacity-0 group-hover/tab:opacity-60 hover:opacity-100 hover:text-canvas-text shrink-0"
                  onClick={(e) => { e.stopPropagation(); closeIdeTab(tab.id); }}
                  title="Close tab"
                >
                  <X size={10} />
                </button>
              </div>
            );
          })}
          {/* End-of-strip dropzone — accepts drops at "after the last tab".
              flex-1 grows to fill remaining horizontal space. */}
          {tabs.length > 0 && (
            <div
              className={`flex-1 min-w-[40px] relative ${tabDropTarget?.id === null ? 'bg-canvas-accent/5' : ''}`}
              onDragOver={(e) => {
                if (!Array.from(e.dataTransfer.types).includes(TAB_DRAG_MIME)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (tabDropTarget?.id !== null || tabDropTarget?.side !== 'after') {
                  setTabDropTarget({ id: null, side: 'after' });
                }
              }}
              onDragLeave={() => {
                if (tabDropTarget?.id === null) setTabDropTarget(null);
              }}
              onDrop={(e) => {
                if (!Array.from(e.dataTransfer.types).includes(TAB_DRAG_MIME)) return;
                e.preventDefault();
                const srcId = e.dataTransfer.getData(TAB_DRAG_MIME);
                setTabDropTarget(null);
                setDraggingTabId(null);
                if (srcId) reorderIdeTab(srcId, null, 'after');
              }}
            >
              {tabDropTarget?.id === null && (
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-canvas-accent pointer-events-none" />
              )}
            </div>
          )}
        </div>

        {/* Active entity — group view, single tile, or empty. */}
        {focusedGroup ? (
          <GroupView
            group={focusedGroup}
            allItems={items}
            onRename={(name) => renameIdeGroup(focusedGroup.id, name)}
            onDelete={() => deleteIdeGroup(focusedGroup.id)}
            onSetLayout={(l) => setGroupLayout(focusedGroup.id, l)}
            onSetSizes={(s) => setGroupSizes(focusedGroup.id, s)}
            onAddMember={(itemId) => addMemberToGroup(focusedGroup.id, itemId)}
            onRemoveMember={(itemId) => removeMemberFromGroup(focusedGroup.id, itemId)}
            onKillMember={(it) => setKillCandidate(it)}
            onSwapMembers={(srcId, dstId) => swapGroupMembers(focusedGroup.id, srcId, dstId)}
          />
        ) : focusedItem ? (
          <Tile
            item={focusedItem}
            isActive
            onActivate={() => { /* already focused */ }}
            onHide={() => closeIdeTab(focusedItem.id)}
            onKill={() => setKillCandidate(focusedItem)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-canvas-muted text-sm">
            <div className="text-center">
              <div className="mb-2">No item selected</div>
              <div className="text-xs">Pick one from the sidebar, or create a new terminal.</div>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={killCandidate !== null}
        title={killCandidate ? `Kill ${killCandidate.type} "${getCanvasItemTitle(killCandidate)}"?` : ''}
        message="This terminates the session and removes the item from the canvas. Cannot be undone."
        confirmLabel="Kill"
        confirmTone="danger"
        busy={killBusy}
        onConfirm={async () => {
          if (!killCandidate) return;
          setKillBusy(true);
          try {
            await removeItem(killCandidate.id);
            closeIdeTab(killCandidate.id);
          } finally {
            setKillBusy(false);
            setKillCandidate(null);
          }
        }}
        onClose={() => setKillCandidate(null)}
      />


      {/* Right-click context menu — items vary based on whether the target is
          a group or a canvas item. Closes via ContextMenu's own outside-click. */}
      <ContextMenu
        open={ctxMenu !== null}
        x={ctxMenu?.x ?? 0}
        y={ctxMenu?.y ?? 0}
        items={(() => {
          if (!ctxMenu) return [];
          const id = ctxMenu.forId;
          if (id.startsWith('group:')) {
            const g = groupsById.get(id);
            if (!g) return [];
            return [
              { label: 'Rename group', onClick: () => setEditing({ id, scope: 'sidebar' }) },
              { label: 'Open as tab', onClick: () => openIdeTab(id) },
              null,
              { label: 'Delete group', danger: true, onClick: () => deleteIdeGroup(id) },
            ];
          }
          const it = items.find((i) => i.id === id);
          if (!it) return [];
          const tabOpen = openTabIds.includes(id);
          return [
            { label: 'Rename', onClick: () => setEditing({ id, scope: 'sidebar' }) },
            tabOpen
              ? { label: 'Close tab', onClick: () => closeIdeTab(id) }
              : { label: 'Open as tab', onClick: () => openIdeTab(id) },
            null,
            { label: it.type === 'terminal' ? 'Kill session' : 'Delete', danger: true, onClick: () => setKillCandidate(it) },
          ];
        })()}
        onClose={() => setCtxMenu(null)}
      />
    </div>
  );
}
