import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ZoomIn, ZoomOut, Maximize, Terminal,
  Columns3, Rows3, LayoutGrid, Menu, X, AppWindow, XSquare, LogOut, Minus, Map, MapPin,
  Save, Download, Trash2, Settings2, Search, GripVertical, Wrench, User,
} from 'lucide-react';
import { useAgentStore } from '../stores/agentStore';
import { useCanvasStore } from '../stores/canvasStore';
import { useAuthStore } from '../stores/authStore';
import { useIsMobile } from '../hooks/useIsMobile';
import { logout as logoutRequest } from '../api/auth';
import { deleteCanvasLayoutSnapshot, listCanvasLayouts, type CanvasLayoutSummary } from '../api/canvas';
import type { CanvasItemType } from '../types';
import { getCanvasItemTitle } from '../utils/canvasItemTitle';
import { getViewportSpawnPosition } from '../utils/canvasViewport';
import { CREATE_ITEMS, createCanvasItemAtPosition } from './createItems';
import ConnectionSettingsModal from './ConnectionSettingsModal';
import MobileConnectionPanel from './MobileConnectionPanel';
import { MobileVisualPanel, MobileAccountPanel } from './MobileSettingsPanel';
import SettingsModal from './SettingsModal';

const APP_VERSION = '0.1.0';
const SEARCH_LIMIT = 10;
const LAYOUT_SCOPE_LABEL: Record<'viewport' | 'world' | 'rulers', string> = {
  viewport: 'Viewport',
  world: 'World',
  rulers: 'Rulers',
};

function BrandMark() {
  return (
    <img src="/favicon.svg" alt="Agent Bridge" className="h-5 w-5 shrink-0" />
  );
}

function LogoutDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[100200] flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div className="w-full max-w-xs rounded-xl border border-canvas-border bg-canvas-surface shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-3">
          <LogOut size={20} className="text-canvas-accent" />
          <div className="text-sm font-semibold text-canvas-text">Sign out?</div>
        </div>
        <div className="text-xs text-canvas-muted mb-5">
          Active terminal sessions will continue running. You can reconnect after signing back in.
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="rounded-md border border-canvas-border px-4 py-1.5 text-xs text-canvas-text hover:bg-canvas-border"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-md bg-canvas-accent/20 border border-canvas-accent px-4 py-1.5 text-xs text-canvas-accent font-semibold hover:bg-canvas-accent/30"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Toolbar() {
  const { agents, currentAgentId, setCurrentAgent } = useAgentStore();
  const {
    zoom, panX, panY, setPan, setZoom, items, addItem, tileWindows, fitAllWindows,
    minimizeAllWindows, closeAllWindows, minimapVisible, setMinimapVisible,
    anchorsPanelVisible, setAnchorsPanelVisible,
    layoutScope, cycleLayoutScope,
    saveLayoutSnapshotToServer, loadLayoutSnapshotFromServer,
  } = useCanvasStore();
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const [dragMode, setDragMode] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [visualSettingsOpen, setVisualSettingsOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [connectionSettingsOpen, setConnectionSettingsOpen] = useState(false);
  const [saveLayoutOpen, setSaveLayoutOpen] = useState(false);
  const [loadLayoutOpen, setLoadLayoutOpen] = useState(false);
  const [layoutsLoading, setLayoutsLoading] = useState(false);
  const [layoutsBusyName, setLayoutsBusyName] = useState<string | null>(null);
  const [layouts, setLayouts] = useState<CanvasLayoutSummary[]>([]);
  const [layoutName, setLayoutName] = useState('');
  const [layoutError, setLayoutError] = useState('');
  const [overwriteCandidate, setOverwriteCandidate] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const searchDropdownRef = useRef<HTMLDivElement | null>(null);
  const [searchDropdownRect, setSearchDropdownRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const authLogout = useAuthStore((s) => s.logout);
  const existingLayoutNames = useMemo(() => new Set(layouts.map((layout) => layout.name.toLowerCase())), [layouts]);
  const sortedBoardItems = useMemo(
    () => [...items].sort((a, b) => getCanvasItemTitle(a).localeCompare(getCanvasItemTitle(b))),
    [items],
  );
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!normalizedSearchQuery) return sortedBoardItems;
    return sortedBoardItems.filter((item) => getCanvasItemTitle(item).toLowerCase().includes(normalizedSearchQuery));
  }, [normalizedSearchQuery, sortedBoardItems]);
  const visibleSearchResults = searchResults.slice(0, SEARCH_LIMIT);
  const hasMoreSearchResults = searchResults.length > SEARCH_LIMIT;

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!searchRef.current?.contains(target) && !searchDropdownRef.current?.contains(target)) {
        setSearchOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  useEffect(() => {
    if (!searchOpen) {
      setSearchDropdownRect(null);
      return;
    }

    const updateRect = () => {
      const rect = searchRef.current?.getBoundingClientRect();
      if (!rect) return;
      setSearchDropdownRect({
        left: rect.left,
        top: rect.bottom + 6,
        width: rect.width,
      });
    };

    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [searchOpen]);

  const handleAdd = (type: CanvasItemType) => {
    const count = items.filter((i) => i.type === type).length;
    const canvasRoot = document.querySelector<HTMLElement>('[data-canvas-root="true"]');
    const { x, y } = getViewportSpawnPosition({
      panX,
      panY,
      zoom,
      index: count,
      isMobile,
      canvasRoot,
    });
    void createCanvasItemAtPosition({
      type,
      x,
      y,
      agentId: currentAgentId,
      addItem,
    });
    setMenuOpen(false);
  };

  const handleNewTerminal = async () => {
    handleAdd('terminal');
  };

  const handleFitIcons = () => {
    window.dispatchEvent(new CustomEvent('fit-canvas-icons'));
    setMenuOpen(false);
  };

  const handleLogout = () => {
    setLogoutConfirmOpen(true);
  };

  const confirmLogout = async () => {
    setLogoutConfirmOpen(false);
    await logoutRequest();
    authLogout();
    window.location.reload();
  };

  const handleSelectSearchItem = (itemId: string) => {
    window.dispatchEvent(new CustomEvent('center-canvas-item', { detail: { itemId } }));
    setSearchQuery('');
    setSearchOpen(false);
  };

  const refreshLayouts = async () => {
    if (!currentAgentId) {
      setLayouts([]);
      return;
    }
    setLayoutsLoading(true);
    setLayoutError('');
    try {
      const next = await listCanvasLayouts(currentAgentId);
      setLayouts(next);
    } catch (error) {
      setLayoutError(error instanceof Error ? error.message : 'Failed to load layouts');
    } finally {
      setLayoutsLoading(false);
    }
  };

  const openSaveLayoutModal = async () => {
    setSaveLayoutOpen(true);
    setLayoutError('');
    setOverwriteCandidate(null);
    await refreshLayouts();
  };

  const openLoadLayoutModal = async () => {
    setLoadLayoutOpen(true);
    setLayoutError('');
    await refreshLayouts();
  };

  const handleSaveLayout = async (forceOverwrite = false) => {
    const trimmed = layoutName.trim();
    if (!trimmed) {
      setLayoutError('Layout name is required');
      return;
    }
    if (!forceOverwrite && existingLayoutNames.has(trimmed.toLowerCase())) {
      setOverwriteCandidate(trimmed);
      setLayoutError(`Layout "${trimmed}" already exists and will be overwritten.`);
      return;
    }
    setLayoutsBusyName(trimmed);
    setLayoutError('');
    setOverwriteCandidate(null);
    try {
      await saveLayoutSnapshotToServer(trimmed);
      setLayoutName('');
      setSaveLayoutOpen(false);
    } catch (error) {
      setLayoutError(error instanceof Error ? error.message : 'Failed to save layout');
    } finally {
      setLayoutsBusyName(null);
    }
  };

  const handleLoadLayout = async (name: string) => {
    setLayoutsBusyName(name);
    setLayoutError('');
    try {
      await loadLayoutSnapshotFromServer(name);
      setLoadLayoutOpen(false);
    } catch (error) {
      setLayoutError(error instanceof Error ? error.message : 'Failed to load layout');
    } finally {
      setLayoutsBusyName(null);
    }
  };

  const handleDeleteLayout = async (name: string) => {
    setLayoutsBusyName(name);
    setLayoutError('');
    try {
      await deleteCanvasLayoutSnapshot(name, currentAgentId);
      await refreshLayouts();
    } catch (error) {
      setLayoutError(error instanceof Error ? error.message : 'Failed to delete layout');
    } finally {
      setLayoutsBusyName(null);
    }
  };

  const applyViewportZoom = (nextZoomValue: number) => {
    const canvasRoot = document.querySelector<HTMLElement>('[data-canvas-root="true"]');
    const nextZoom = Math.max(0.1, Math.min(3.0, nextZoomValue));
    if (!canvasRoot || nextZoom === zoom) {
      setZoom(nextZoom);
      return;
    }

    const cx = canvasRoot.clientWidth / 2;
    const cy = canvasRoot.clientHeight / 2;

    if (isMobile) {
      const worldX = (cx - panX) / zoom;
      const worldY = (cy - panY) / zoom;
      setZoom(nextZoom);
      setPan(cx - worldX * nextZoom, cy - worldY * nextZoom);
      return;
    }

    const worldX = (canvasRoot.scrollLeft + cx) / zoom;
    const worldY = (canvasRoot.scrollTop + cy) / zoom;
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      canvasRoot.scrollLeft = worldX * nextZoom - cx;
      canvasRoot.scrollTop = worldY * nextZoom - cy;
      setPan(canvasRoot.scrollLeft, canvasRoot.scrollTop);
    });
  };

  if (isMobile) {
    return (
      <>
      <div className="bg-canvas-surface border-b border-canvas-border shrink-0 relative z-[60]">
        <div className="h-10 flex items-center px-3 gap-2">
          <button
            onClick={() => setAboutOpen(true)}
            className="inline-flex items-center justify-center rounded hover:bg-canvas-border p-0.5 shrink-0"
            title="About Agent Bridge"
          >
            <BrandMark />
          </button>
          <div className="relative min-w-0 flex-shrink">
            <button
              onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
              className="bg-canvas-bg border border-canvas-border rounded px-2 py-1 text-xs text-canvas-text flex items-center gap-1"
            >
              <span className="truncate">{agents.find(a => a.id === currentAgentId)?.name || 'Select'}</span>
              <span className="text-canvas-muted">▾</span>
            </button>
            {agentDropdownOpen && (
              <>
                <div className="fixed inset-0 z-[70]" onClick={() => setAgentDropdownOpen(false)} />
                <div className="absolute top-full left-0 mt-1 bg-canvas-surface border border-canvas-border rounded shadow-lg z-[71] min-w-[180px] max-h-[60vh] overflow-y-auto">
                  {agents.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => { setCurrentAgent(a.id); setAgentDropdownOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-canvas-border ${a.id === currentAgentId ? 'text-canvas-accent bg-canvas-accent/10' : 'text-canvas-text'}`}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={() => setConnectionSettingsOpen(true)}
            className="inline-flex items-center justify-center rounded hover:bg-canvas-border p-1 shrink-0"
            title="PTY daemon connections"
          >
            <Settings2 size={16} className="text-canvas-muted" />
          </button>
          <button
            onClick={() => {
              const next = !dragMode;
              setDragMode(next);
              if (next) { setDeleteMode(false); window.dispatchEvent(new CustomEvent('mobile-delete-mode', { detail: { enabled: false } })); }
              window.dispatchEvent(new CustomEvent('mobile-drag-mode', { detail: { enabled: next } }));
            }}
            className={`inline-flex items-center justify-center rounded p-1 shrink-0 ${dragMode ? 'bg-canvas-accent/20 ring-1 ring-canvas-accent' : 'hover:bg-canvas-border'}`}
            title={dragMode ? 'Exit reorder mode' : 'Reorder icons'}
          >
            <GripVertical size={16} className={dragMode ? 'text-canvas-accent' : 'text-canvas-muted'} />
          </button>
          <button
            onClick={() => {
              const next = !deleteMode;
              setDeleteMode(next);
              if (next) { setDragMode(false); window.dispatchEvent(new CustomEvent('mobile-drag-mode', { detail: { enabled: false } })); }
              window.dispatchEvent(new CustomEvent('mobile-delete-mode', { detail: { enabled: next } }));
            }}
            className={`inline-flex items-center justify-center rounded p-1 shrink-0 ${deleteMode ? 'bg-red-500/20 ring-1 ring-red-500' : 'hover:bg-canvas-border'}`}
            title={deleteMode ? 'Exit delete mode' : 'Delete mode'}
          >
            <Trash2 size={16} className={deleteMode ? 'text-red-400' : 'text-canvas-muted'} />
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 hover:bg-canvas-border rounded"
          >
            {menuOpen ? <X size={18} className="text-canvas-muted" /> : <Menu size={18} className="text-canvas-muted" />}
          </button>
        </div>

        {menuOpen && (
          <>
          <div className="fixed inset-0 z-[60]" onClick={() => setMenuOpen(false)} />
          <div className="absolute top-10 left-0 right-0 bg-canvas-surface border-b border-canvas-border z-[61] shadow-lg">
            <div className="p-2 space-y-1">
              <div className="text-[10px] text-canvas-muted px-2 py-1 uppercase tracking-wider">Create</div>
              <div className="flex gap-1 px-2">
                <button
                  onClick={handleNewTerminal}
                  className="w-10 h-10 flex items-center justify-center hover:bg-canvas-border rounded"
                  title="New Terminal"
                >
                  <Terminal size={18} className="text-canvas-accent" />
                </button>
                {CREATE_ITEMS.filter(({ type }) => type !== 'terminal').map(({ type, label, icon: Icon }) => (
                  <button
                    key={type}
                    onClick={() => handleAdd(type)}
                    className="w-10 h-10 flex items-center justify-center hover:bg-canvas-border rounded"
                    title={label}
                  >
                    <Icon size={18} className="text-canvas-accent" />
                  </button>
                ))}
              </div>

              <div className="h-px bg-canvas-border my-1" />
              <div className="text-[10px] text-canvas-muted px-2 py-1 uppercase tracking-wider">Settings</div>
              <div className="flex gap-1 px-2">
                <button
                  onClick={() => { setVisualSettingsOpen(true); setMenuOpen(false); }}
                  className="w-10 h-10 flex items-center justify-center hover:bg-canvas-border rounded"
                  title="Visual"
                >
                  <Wrench size={18} className="text-canvas-accent" />
                </button>
                <button
                  onClick={() => { setAccountSettingsOpen(true); setMenuOpen(false); }}
                  className="w-10 h-10 flex items-center justify-center hover:bg-canvas-border rounded"
                  title="Account"
                >
                  <User size={18} className="text-canvas-accent" />
                </button>
              </div>

              <div className="h-px bg-canvas-border my-1" />
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-2 py-2 hover:bg-canvas-border rounded text-canvas-muted"
              >
                <LogOut size={16} />
                <span className="text-xs">Logout</span>
              </button>
            </div>
          </div>
          </>
        )}
      </div>
      {aboutOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4" data-canvas-interactive="true">
          <div className="w-full max-w-xs rounded-xl border border-canvas-border bg-canvas-surface shadow-2xl p-5">
            <div className="flex items-center gap-3">
              <BrandMark />
              <div>
                <div className="text-sm font-semibold text-canvas-text">Agent Bridge</div>
                <div className="text-xs text-canvas-muted">Canvas frontend</div>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-canvas-border bg-canvas-bg px-3 py-2 text-sm text-canvas-text">
              Version {APP_VERSION}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                className="rounded-md border border-canvas-border px-3 py-1.5 text-xs text-canvas-text hover:bg-canvas-border"
                onClick={() => setAboutOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <MobileConnectionPanel open={connectionSettingsOpen} onClose={() => setConnectionSettingsOpen(false)} />
      <MobileVisualPanel open={visualSettingsOpen} onClose={() => setVisualSettingsOpen(false)} />
      <MobileAccountPanel open={accountSettingsOpen} onClose={() => setAccountSettingsOpen(false)} />
      {logoutConfirmOpen && <LogoutDialog onConfirm={confirmLogout} onCancel={() => setLogoutConfirmOpen(false)} />}
      </>
    );
  }

  // Desktop toolbar — compact, icons only for add buttons
  return (
    <>
    <div className="h-10 bg-canvas-surface border-b border-canvas-border flex items-center px-2 gap-1 shrink-0 overflow-x-auto overflow-y-hidden whitespace-nowrap">
      <button
        onClick={() => setAboutOpen(true)}
        className="inline-flex items-center justify-center rounded hover:bg-canvas-border p-0.5 mr-1 shrink-0"
        title="About Agent Bridge"
      >
        <BrandMark />
      </button>
      <select
        value={currentAgentId || ''}
        onChange={(e) => setCurrentAgent(e.target.value)}
        className="bg-canvas-bg border border-canvas-border rounded px-2 py-1 text-xs text-canvas-text focus:outline-none focus:border-canvas-accent shrink-0"
      >
        {agents.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
      <button
        onClick={() => setConnectionSettingsOpen(true)}
        className="p-1 hover:bg-canvas-border rounded transition-colors shrink-0"
        title="PTY daemon connections"
      >
        <Settings2 size={14} className="text-canvas-accent" />
      </button>

      <div className="h-4 w-px bg-canvas-border mx-1 shrink-0" />

      <button
        onClick={handleNewTerminal}
        className="p-1 hover:bg-canvas-border rounded transition-colors shrink-0"
        title="New Terminal"
      >
        <Terminal size={14} className="text-canvas-accent" />
      </button>
      {CREATE_ITEMS.filter(({ type }) => type !== 'terminal').map(({ type, label, icon: Icon }) => (
        <button
          key={type}
          onClick={() => handleAdd(type)}
          className="p-1 hover:bg-canvas-border rounded transition-colors shrink-0"
          title={`New ${label}`}
        >
          <Icon size={14} className="text-canvas-accent" />
        </button>
      ))}

      <div className="h-4 w-px bg-canvas-border mx-1 shrink-0" />
      <div className="flex items-center gap-0.5 shrink-0">
        <button onClick={() => void openSaveLayoutModal()} className="p-1 hover:bg-canvas-border rounded shrink-0" title="Save layout">
          <Save size={14} className="text-canvas-accent" />
        </button>
        <button onClick={() => void openLoadLayoutModal()} className="p-1 hover:bg-canvas-border rounded shrink-0" title="Load layout">
          <Download size={14} className="text-canvas-accent" />
        </button>
      </div>

      <div className="h-4 w-px bg-canvas-border mx-1 shrink-0" />
      <div ref={searchRef} className="relative w-56 shrink-0" data-canvas-interactive="true">
        <div className="flex items-center gap-2 rounded-md border border-canvas-border bg-canvas-bg px-2 py-1">
          <Search size={14} className="shrink-0 text-canvas-muted" />
          <input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchOpen(false);
                return;
              }
              if (e.key === 'Enter' && visibleSearchResults[0]) {
                e.preventDefault();
                handleSelectSearchItem(visibleSearchResults[0].id);
              }
            }}
            placeholder="Find on board..."
            className="w-full bg-transparent text-xs text-canvas-text outline-none placeholder:text-canvas-muted"
          />
        </div>
      </div>

      <div className="flex-1 min-w-0" />

      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={() => cycleLayoutScope()}
          className="rounded border border-canvas-border px-2 py-1 text-[10px] text-canvas-text hover:bg-canvas-border shrink-0"
          title="Cycle layout scope"
        >
          {LAYOUT_SCOPE_LABEL[layoutScope]}
        </button>
        <button onClick={() => tileWindows('columns', layoutScope)} className="p-1 hover:bg-canvas-border rounded shrink-0" title="Tile columns">
          <Columns3 size={14} className="text-canvas-accent" />
        </button>
        <button onClick={() => tileWindows('rows', layoutScope)} className="p-1 hover:bg-canvas-border rounded shrink-0" title="Tile rows">
          <Rows3 size={14} className="text-canvas-accent" />
        </button>
        <button onClick={() => tileWindows('grid', layoutScope)} className="p-1 hover:bg-canvas-border rounded shrink-0" title="Tile grid">
          <LayoutGrid size={14} className="text-canvas-accent" />
        </button>
        <button onClick={() => fitAllWindows(layoutScope)} className="p-1 hover:bg-canvas-border rounded shrink-0" title="Show all windows">
          <AppWindow size={14} className="text-canvas-accent" />
        </button>
        <button onClick={() => setMinimapVisible(!minimapVisible)} className="p-1 hover:bg-canvas-border rounded shrink-0" title={minimapVisible ? 'Hide map' : 'Show map'}>
          <Map size={14} className={minimapVisible ? 'text-canvas-accent' : 'text-canvas-muted'} />
        </button>
        <button onClick={() => setAnchorsPanelVisible(!anchorsPanelVisible)} className="p-1 hover:bg-canvas-border rounded shrink-0" title={anchorsPanelVisible ? 'Hide anchors' : 'Show anchors'}>
          <MapPin size={14} className={anchorsPanelVisible ? 'text-canvas-accent' : 'text-canvas-muted'} />
        </button>
        <button onClick={() => minimizeAllWindows(layoutScope)} className="p-1 hover:bg-canvas-border rounded shrink-0" title="Minimize all windows">
          <Minus size={14} className="text-canvas-accent" />
        </button>
        <button onClick={() => closeAllWindows(layoutScope)} className="p-1 hover:bg-canvas-border rounded shrink-0" title="Close all windows">
          <XSquare size={14} className="text-canvas-accent" />
        </button>
      </div>

      <div className="h-4 w-px bg-canvas-border mx-1 shrink-0" />

      <div className="flex items-center gap-0.5 shrink-0">
        <button onClick={() => applyViewportZoom(zoom - 0.1)} className="p-1 hover:bg-canvas-border rounded shrink-0" title="Zoom out">
          <ZoomOut size={14} className="text-canvas-accent" />
        </button>
        <button
          onClick={() => applyViewportZoom(1)}
          className="text-[10px] text-canvas-muted w-8 text-center shrink-0 hover:text-canvas-accent"
          title="Reset zoom to 100%"
          data-zoom-display
        >
          {Math.round(zoom * 100)}%
        </button>
        <button onClick={() => applyViewportZoom(zoom + 0.1)} className="p-1 hover:bg-canvas-border rounded shrink-0" title="Zoom in">
          <ZoomIn size={14} className="text-canvas-accent" />
        </button>
        <button onClick={handleFitIcons} className="p-1 hover:bg-canvas-border rounded shrink-0" title="Fit icons">
          <Maximize size={14} className="text-canvas-accent" />
        </button>
      </div>

      <div className="h-4 w-px bg-canvas-border mx-1 shrink-0" />
      <button onClick={() => setSettingsOpen(true)} className="p-1 hover:bg-canvas-border rounded shrink-0" title="Settings">
        <Wrench size={14} className="text-canvas-accent" />
      </button>
      <button onClick={handleLogout} className="p-1 hover:bg-canvas-border rounded shrink-0" title="Logout">
        <LogOut size={14} className="text-canvas-accent" />
      </button>
    </div>
    {searchOpen && searchDropdownRect && createPortal(
      <div
        ref={searchDropdownRef}
        className="fixed z-[100200] overflow-hidden rounded-lg border border-canvas-border bg-canvas-surface shadow-2xl"
        style={{
          left: searchDropdownRect.left,
          top: searchDropdownRect.top,
          width: searchDropdownRect.width,
        }}
        data-canvas-interactive="true"
      >
        {visibleSearchResults.length > 0 ? (
          <>
            {visibleSearchResults.map((item) => (
              <button
                key={item.id}
                onClick={() => handleSelectSearchItem(item.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-canvas-border"
              >
                <span className="truncate text-xs text-canvas-text">{getCanvasItemTitle(item)}</span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-canvas-muted">{item.type}</span>
              </button>
            ))}
            {hasMoreSearchResults && (
              <div className="border-t border-canvas-border px-3 py-2 text-center text-xs text-canvas-muted">...</div>
            )}
          </>
        ) : (
          <div className="px-3 py-2 text-xs text-canvas-muted">No matches</div>
        )}
      </div>,
      document.body,
    )}
    {aboutOpen && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4" data-canvas-interactive="true">
        <div className="w-full max-w-sm rounded-xl border border-canvas-border bg-canvas-surface shadow-2xl p-5">
          <div className="flex items-center gap-3">
            <BrandMark />
            <div>
              <div className="text-base font-semibold text-canvas-text">Agent Bridge</div>
              <div className="text-xs text-canvas-muted">Canvas frontend</div>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-canvas-border bg-canvas-bg px-3 py-2 text-sm text-canvas-text">
            Version {APP_VERSION}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              className="rounded-md border border-canvas-border px-3 py-1.5 text-xs text-canvas-text hover:bg-canvas-border"
              onClick={() => setAboutOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )}
    {saveLayoutOpen && (
      <div className="fixed inset-0 z-[100100] flex items-center justify-center bg-black/50 px-4" data-canvas-interactive="true">
        <div className="w-full max-w-md rounded-xl border border-canvas-border bg-canvas-surface shadow-2xl p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-canvas-text">Save layout</div>
              <div className="text-xs text-canvas-muted">Store the current board layout on the server.</div>
            </div>
            <button
              className="rounded-md border border-canvas-border px-2 py-1 text-xs text-canvas-text hover:bg-canvas-border"
              onClick={() => {
                setSaveLayoutOpen(false);
                setLayoutError('');
                setOverwriteCandidate(null);
              }}
            >
              Close
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <input
              value={layoutName}
              onChange={(e) => {
                setLayoutName(e.target.value);
                setOverwriteCandidate(null);
                setLayoutError('');
              }}
              placeholder="Layout name"
              className="w-full rounded-md border border-canvas-border bg-canvas-bg px-3 py-2 text-sm text-canvas-text outline-none focus:border-canvas-accent"
            />
            {layoutError && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {layoutError}
              </div>
            )}
            {overwriteCandidate && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Layout "{overwriteCandidate}" already exists. Saving will overwrite it.
              </div>
            )}
            <div className="flex justify-end gap-2">
              {overwriteCandidate ? (
                <button
                  className="inline-flex items-center gap-2 rounded-md border border-amber-500/40 px-3 py-2 text-xs text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
                  onClick={() => void handleSaveLayout(true)}
                  disabled={!currentAgentId || !!layoutsBusyName}
                >
                  <Save size={14} />
                  Overwrite
                </button>
              ) : (
                <button
                  className="inline-flex items-center gap-2 rounded-md border border-canvas-border px-3 py-2 text-xs text-canvas-text hover:bg-canvas-border disabled:opacity-50"
                  onClick={() => void handleSaveLayout()}
                  disabled={!currentAgentId || !!layoutsBusyName}
                >
                  <Save size={14} />
                  Save
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )}
    {loadLayoutOpen && (
      <div className="fixed inset-0 z-[100100] flex items-center justify-center bg-black/50 px-4" data-canvas-interactive="true">
        <div className="w-full max-w-lg rounded-xl border border-canvas-border bg-canvas-surface shadow-2xl p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-semibold text-canvas-text">Load layout</div>
              <div className="text-xs text-canvas-muted">Choose a saved layout for the current agent board.</div>
            </div>
            <button
              className="rounded-md border border-canvas-border px-2 py-1 text-xs text-canvas-text hover:bg-canvas-border"
              onClick={() => {
                setLoadLayoutOpen(false);
                setLayoutError('');
              }}
            >
              Close
            </button>
          </div>

          {layoutError && (
            <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {layoutError}
            </div>
          )}

          <div className="mt-4 max-h-80 overflow-auto rounded-lg border border-canvas-border bg-canvas-bg">
            {layoutsLoading ? (
              <div className="px-3 py-4 text-xs text-canvas-muted">Loading layouts...</div>
            ) : layouts.length === 0 ? (
              <div className="px-3 py-4 text-xs text-canvas-muted">No saved layouts yet.</div>
            ) : (
              layouts.map((layout) => (
                <div key={layout.name} className="flex items-center gap-3 border-b border-canvas-border px-3 py-2 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-canvas-text">{layout.name}</div>
                    <div className="text-[11px] text-canvas-muted">{layout.savedAt || 'Saved layout'}</div>
                  </div>
                  <button
                    className="inline-flex items-center gap-1 rounded-md border border-canvas-border px-2 py-1 text-xs text-canvas-text hover:bg-canvas-border disabled:opacity-50"
                    onClick={() => void handleLoadLayout(layout.name)}
                    disabled={!!layoutsBusyName}
                  >
                    <Download size={12} />
                    Load
                  </button>
                  <button
                    className="inline-flex items-center gap-1 rounded-md border border-canvas-border px-2 py-1 text-xs text-red-200 hover:bg-red-500/10 disabled:opacity-50"
                    onClick={() => void handleDeleteLayout(layout.name)}
                    disabled={!!layoutsBusyName}
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    )}
    <ConnectionSettingsModal open={connectionSettingsOpen} onClose={() => setConnectionSettingsOpen(false)} />
    <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    {logoutConfirmOpen && <LogoutDialog onConfirm={confirmLogout} onCancel={() => setLogoutConfirmOpen(false)} />}
    </>
  );
}
