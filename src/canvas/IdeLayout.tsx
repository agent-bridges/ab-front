import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
} from 'lucide-react';
import { useCanvasStore } from '../stores/canvasStore';
import TerminalView from '../components/terminal/TerminalView';
import FileBrowserView from '../components/filebrowser/FileBrowserView';
import NotesEditor from '../components/notes/NotesEditor';
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
};

const TYPE_ICON: Record<CanvasItemType, typeof TerminalIcon> = {
  terminal: TerminalIcon,
  notes: StickyNote,
  filebrowser: FolderOpen,
  anchor: MapPin,
};

// Section render order for 'type' sort.
const TYPE_ORDER: CanvasItemType[] = ['terminal', 'notes', 'filebrowser', 'anchor'];

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

function ItemBody({ item }: { item: CanvasItem }) {
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
          <NotesEditor item={item} />
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

/**
 * One tile inside a multi-tab group. Its own toolbar (refresh / hide / kill)
 * applies to this tile only — same UX as the canvas Window component, but
 * fitted into a tiled cell.
 */
function Tile({
  item,
  isActive,
  onActivate,
  onHide,
  onKill,
}: {
  item: CanvasItem;
  isActive: boolean;
  onActivate: () => void;
  onHide: () => void;
  onKill: () => void;
}) {
  return (
    <div
      // flex-1 is critical: without it the tile collapses to its toolbar's
      // content height and the inner ItemBody (terminal/notes) renders with
      // 0 height — terminal shows just one row of output.
      className={`flex-1 flex flex-col min-w-0 min-h-0 border ${isActive ? 'border-canvas-accent/40' : 'border-canvas-border'} bg-canvas-bg`}
      onPointerDown={onActivate}
    >
      <div className="flex items-center gap-1 shrink-0 px-2 py-1 border-b border-canvas-border bg-canvas-surface">
        <TerminalLeftIcon item={item} />
        <span className="flex-1 truncate text-[10px] text-canvas-muted">
          {getCanvasItemTitle(item, { fullPath: true })}
        </span>
        {item.type === 'terminal' && item.ptyId && (
          <button
            className="p-1 rounded hover:bg-canvas-border text-canvas-muted hover:text-canvas-accent"
            onClick={(e) => { e.stopPropagation(); forceTerminalRefresh(item.ptyId!); }}
            title="Force redraw"
          >
            <RotateCw size={11} />
          </button>
        )}
        <button
          className="p-1 rounded hover:bg-canvas-border text-canvas-muted hover:text-canvas-text"
          onClick={(e) => { e.stopPropagation(); onHide(); }}
          title="Hide window (keeps the session alive)"
        >
          <Minus size={11} />
        </button>
        <button
          className="p-1 rounded hover:bg-red-500/20 text-canvas-muted hover:text-red-400"
          onClick={(e) => { e.stopPropagation(); onKill(); }}
          title="Kill instance"
        >
          <X size={11} />
        </button>
      </div>
      <ItemBody item={item} />
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
}: {
  items: CanvasItem[];
  layout: IdeGroupLayout;
  sizes: IdeGroupSizes;
  activeId: string | null;
  onActivate: (id: string) => void;
  onHide: (id: string) => void;
  onKill: (item: CanvasItem) => void;
  onResize: (sizes: IdeGroupSizes) => void;
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
  const setGroupLayout = useCanvasStore((s) => s.setGroupLayout);
  const setGroupSizes = useCanvasStore((s) => s.setGroupSizes);
  const addItem = useCanvasStore((s) => s.addItem);
  const removeItem = useCanvasStore((s) => s.removeItem);

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

  return (
    <div className="absolute inset-0 flex bg-canvas-bg">
      {/* Sidebar */}
      <div
        className="flex flex-col border-r border-canvas-border bg-canvas-surface min-h-0"
        style={{ width: sidebarWidth }}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-canvas-border shrink-0">
          <span className="text-xs uppercase tracking-wider text-canvas-muted flex-1">Explorer</span>
          <button
            className="p-1 rounded hover:bg-canvas-border text-canvas-muted relative"
            onClick={() => setSortMenuOpen((v) => !v)}
            title={`Sort: ${SORT_LABEL[sort]}`}
          >
            <ArrowDownUp size={12} />
          </button>
          {sortMenuOpen && (
            <div className="absolute right-2 top-9 z-10 bg-canvas-surface border border-canvas-border rounded shadow-lg py-1 min-w-[120px]">
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
          {/* GROUPS section — first-class containers (IDE-only state). */}
          <div>
            <div className="flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-wider text-canvas-muted">
              <span className="flex-1">Groups</span>
              <span className="opacity-60 mr-1">{ideGroups.length}</span>
              <button
                className="p-0.5 rounded hover:bg-canvas-border hover:text-canvas-text"
                title="New empty group"
                onClick={() => createIdeGroup([])}
              >
                <Plus size={10} />
              </button>
            </div>
            {ideGroups.map((g) => {
              const isActive = focusedItemId === g.id;
              return (
                <button
                  key={g.id}
                  className={`w-full flex items-center gap-2 px-3 py-1 text-xs text-left transition-colors ${
                    isActive ? 'bg-canvas-accent/20 text-canvas-text' : 'text-canvas-text hover:bg-canvas-border'
                  }`}
                  onClick={() => openIdeTab(g.id)}
                  title={`${g.name} — ${g.members.length} members`}
                >
                  <LayoutGrid size={12} className="text-canvas-accent shrink-0" />
                  <span className="truncate flex-1">{g.name}</span>
                  <span className="text-[9px] opacity-60">{g.members.length}</span>
                </button>
              );
            })}
            {ideGroups.length === 0 && (
              <div className="px-3 py-1 text-[10px] text-canvas-muted italic">No groups</div>
            )}
          </div>

          {itemSections.map((g) => {
            const isCollapsed = collapsed[g.type];
            return (
              <div key={g.type}>
                {sort === 'type' && (
                  <button
                    className="w-full flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-wider text-canvas-muted hover:text-canvas-text"
                    onClick={() => setCollapsed((c) => ({ ...c, [g.type]: !c[g.type] }))}
                  >
                    {isCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                    <span>{TYPE_LABEL[g.type]}</span>
                    <span className="ml-1 opacity-60">{g.items.length}</span>
                  </button>
                )}
                {!isCollapsed && g.items.map((item) => {
                  const isActive = focusedItemId === item.id;
                  return (
                    <button
                      key={item.id}
                      className={`w-full flex items-center gap-2 px-3 py-1 text-xs text-left transition-colors ${
                        isActive
                          ? 'bg-canvas-accent/20 text-canvas-text'
                          : 'text-canvas-text hover:bg-canvas-border'
                      }`}
                      onClick={() => openIdeTab(item.id)}
                      title={getCanvasItemTitle(item, { fullPath: true })}
                    >
                      <TerminalLeftIcon item={item} />
                      <span className="truncate flex-1">{getCanvasItemTitle(item)}</span>
                      {item.pinned && <span className="text-[9px] text-canvas-accent" title="Pinned">📌</span>}
                      {item.window?.locked && <span className="text-[9px] text-canvas-muted" title="Locked">🔒</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {itemSections.length === 0 && (
            <div className="px-3 py-4 text-xs text-canvas-muted">No items on this canvas yet.</div>
          )}
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
        {/* Tab strip — heterogeneous: tabs may be items or groups. */}
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
            return (
              <div
                key={tab.id}
                className={`group/tab flex items-center gap-2 px-3 py-1.5 text-xs border-r border-canvas-border cursor-pointer ${
                  isActive ? 'bg-canvas-bg text-canvas-text' : 'text-canvas-muted hover:bg-canvas-border/50'
                }`}
                onClick={() => setIdeFocusedItem(tab.id)}
                onAuxClick={(e) => { if (e.button === 1) closeIdeTab(tab.id); }}
                title={`${fullTitle} — click=focus, middle-click=close tab`}
              >
                {tab.kind === 'item'
                  ? <TerminalLeftIcon item={tab.item} />
                  : <LayoutGrid size={12} className="text-canvas-accent shrink-0" />}
                <span className="max-w-[160px] truncate">{label}</span>
                {tab.kind === 'group' && (
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
    </div>
  );
}
