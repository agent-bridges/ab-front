import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Cable, Eye, EyeOff, FolderOpen, GripVertical, Keyboard, LayoutGrid, Lock, LogOut, Menu,
  Link2, Minus, Pencil, Plus, RotateCw, StickyNote, Terminal as TerminalIcon,
  Trash2, User, Wrench, X,
} from 'lucide-react';
import { logout as logoutRequest } from '../api/auth';
import { createPty, killPty } from '../api/pty';
import {
  MobileAccountPanel, MobileAuthPanel, MobileVisualPanel,
} from '../components/MobileSettingsPanel';
import { getAgentActivityLabel, getTerminalStatusMeta, PROCESS_STATUS_THEME } from '../components/ProcessIndicator';
import ClaudeIcon from '../components/icons/ClaudeIcon';
import CodexIcon from '../components/icons/CodexIcon';
import FileBrowserView from '../components/filebrowser/FileBrowserView';
import NotesEditor from '../components/notes/NotesEditor';
import TerminalView from '../components/terminal/TerminalView';
import TerminalAttachMenu from '../components/terminal/TerminalAttachMenu';
import TunnelsView from '../components/tunnels/TunnelsView';
import ConfirmDialog from '../components/dialogs/ConfirmDialog';
import { useAgentStore } from '../stores/agentStore';
import { useAuthStore } from '../stores/authStore';
import { useKeyboardStore } from '../stores/keyboardStore';
import { usePtyStore } from '../stores/ptyStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import type { BoardItem, BoardItemType, PtySession, Relay } from '../types';
import { managementEntrypointsForCapabilities, useCapabilities } from '../hooks/useCapabilities';
import { agentDisplayLabel, relayCanConnect, relayStateLabel } from '../utils/agentDisplay';
import { useCapabilitiesStore } from '../stores/capabilitiesStore';
import DiscoveryErrorBanner from '../components/DiscoveryErrorBanner';
import RelayAdminModal from '../components/RelayAdminModal';
import ClientAliasDialog from '../components/ClientAliasDialog';
import type { Agent } from '../types';
import DaemonLinkDialog from '../components/DaemonLinkDialog';
import { daemonDisplayName, sessionAliasKey, sessionDisplayName, useClientAliasStore } from '../stores/clientAliasStore';
import { filterOfflineMachines, useShowOfflineMachines } from '../hooks/useShowOfflineMachines';

const DEFAULT_COLUMNS = 5;
const COLUMNS_KEY = 'ab-mobile-icons-per-row';
const TAB_HEIGHT = 36;
export const MOBILE_TILE_LABEL_LINES = 2;

export type MobileEntry =
  | { key: string; kind: 'session'; agentId: string; session: PtySession }
  | { key: string; kind: 'board'; agentId: string; item: BoardItem };

export const sessionKey = (id: string) => `session:${id}`;
export const boardKey = (id: string) => `board:${id}`;
export const mobileEntryTitle = (entry: MobileEntry) => entry.kind === 'session' ? entry.session.name : entry.item.label;
export const mobileEntryDisplayTitle = (entry: MobileEntry, aliases: Record<string, string>) =>
  entry.kind === 'session' ? sessionDisplayName(entry.agentId, entry.session, aliases) : entry.item.label;

export function reconcileMobileOrder(previous: string[], available: string[]): string[] {
  const availableSet = new Set(available);
  const kept = previous.filter((id) => availableSet.has(id));
  const keptSet = new Set(kept);
  return [...kept, ...available.filter((id) => !keptSet.has(id))];
}

function loadColumns(): number {
  try {
    const value = Number(localStorage.getItem(COLUMNS_KEY));
    return Number.isFinite(value) && value >= 3 && value <= 8 ? value : DEFAULT_COLUMNS;
  } catch { return DEFAULT_COLUMNS; }
}

function EntryIcon({ entry, size = 24 }: { entry: MobileEntry; size?: number }) {
  if (entry.kind === 'board') {
    const Icon = entry.item.type === 'notes' ? StickyNote : entry.item.type === 'filebrowser' ? FolderOpen : Cable;
    return (
      <div className="flex shrink-0 items-center justify-center rounded-lg border border-canvas-border bg-canvas-surface" style={{ width: size * 2, height: size * 2 }}>
        <Icon size={size} className="text-canvas-accent" />
      </div>
    );
  }

  const meta = getTerminalStatusMeta(entry.session.alive, entry.session.processes, entry.session.ai_status);
  const aiIconClass = meta.status === 'ai-busy'
    ? 'animate-pulse text-orange-400'
    : meta.status === 'ai-idle'
      ? 'text-green-400'
      : 'text-canvas-muted';
  return (
    <div className={`relative flex shrink-0 items-center justify-center rounded-lg border bg-canvas-surface ${PROCESS_STATUS_THEME[meta.status].borderClass}`} style={{ width: size * 2, height: size * 2 }}>
      {meta.aiAgent === 'claude'
        ? <ClaudeIcon size={size} className={aiIconClass} />
        : meta.aiAgent === 'codex'
          ? <CodexIcon size={size} className={aiIconClass} />
          : <TerminalIcon size={size} className="text-canvas-accent" />}
      <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-canvas-bg ${PROCESS_STATUS_THEME[meta.status].dotClass}`} />
    </div>
  );
}

function EntryBody({ entry }: { entry: MobileEntry }) {
  if (entry.kind === 'session') return <TerminalView session={entry.session} agentId={entry.agentId} />;
  if (entry.item.type === 'filebrowser') return <FileBrowserView item={entry.item} />;
  if (entry.item.type === 'notes') return <NotesEditor item={entry.item} />;
  return <TunnelsView item={entry.item} />;
}

function AgentActivityBadge({ entry, className = '' }: { entry: MobileEntry; className?: string }) {
  if (entry.kind !== 'session') return null;
  const activity = getAgentActivityLabel(getTerminalStatusMeta(entry.session.alive, entry.session.processes, entry.session.ai_status));
  if (!activity) return null;
  return <span className={`truncate text-[8px] font-medium ${activity.className} ${className}`} title={activity.text}>{activity.text}</span>;
}

function LogoutDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[100200] flex items-center justify-center bg-black/60 px-4" onClick={onCancel}>
      <div className="w-full max-w-xs rounded-xl border border-canvas-border bg-canvas-surface p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center gap-3"><LogOut size={20} className="text-canvas-accent" /><div className="text-sm font-semibold text-canvas-text">Sign out?</div></div>
        <div className="mb-5 text-xs text-canvas-muted">Active terminal sessions will continue running.</div>
        <div className="flex justify-end gap-2">
          <button className="rounded-md border border-canvas-border px-4 py-1.5 text-xs" onClick={onCancel}>Cancel</button>
          <button className="rounded-md border border-canvas-accent bg-canvas-accent/20 px-4 py-1.5 text-xs font-semibold text-canvas-accent" onClick={onConfirm}>Sign out</button>
        </div>
      </div>
    </div>
  );
}

export default function MobileWorkspace() {
  const capabilities = useCapabilities();
  const management = managementEntrypointsForCapabilities(capabilities);
  const agents = useAgentStore((state) => state.agents);
  const relays = useAgentStore((state) => state.relays);
  const relayRevision = useAgentStore((state) => state.revision);
  const canAdministerRelays = management.relayAdministration && relayRevision !== null;
  const relayError = useAgentStore((state) => state.discoveryError);
  const loadRelays = useAgentStore((state) => state.loadRelays);
  const capabilitiesError = useCapabilitiesStore((state) => state.error);
  const workspaceError = useWorkspaceStore((state) => state.loadError);
  const loadItems = useWorkspaceStore((state) => state.load);
  const loadCapabilities = useCapabilitiesStore((state) => state.load);
  const currentAgentId = useAgentStore((state) => state.currentAgentId);
  const setCurrentAgent = useAgentStore((state) => state.setCurrentAgent);
  const sessionsById = usePtyStore((state) => state.sessionsById);
  const ptyAgentId = usePtyStore((state) => state.agentId);
  const daemonAliases = useClientAliasStore((state) => state.daemons);
  const sessionAliases = useClientAliasStore((state) => state.sessions);
  const setDaemonAlias = useClientAliasStore((state) => state.setDaemonAlias);
  const setSessionAlias = useClientAliasStore((state) => state.setSessionAlias);
  const boardItems = useWorkspaceStore((state) => state.boardItems);
  const workspaceAgentId = useWorkspaceStore((state) => state.agentId);
  const openTabIds = useWorkspaceStore((state) => state.openTabIds);
  const openTab = useWorkspaceStore((state) => state.openTab);
  const closeTab = useWorkspaceStore((state) => state.closeTab);
  const addBoardItem = useWorkspaceStore((state) => state.addBoardItem);
  const updateBoardItem = useWorkspaceStore((state) => state.updateBoardItem);
  const removeBoardItem = useWorkspaceStore((state) => state.removeBoardItem);
  const keyboardVisible = useKeyboardStore((state) => state.keyboard.visible);
  const setKeyboardVisible = useKeyboardStore((state) => state.setKeyboardVisible);
  const authLogout = useAuthStore((state) => state.logout);

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [columns, setColumns] = useState(loadColumns);
  const [order, setOrder] = useState<string[]>([]);
  const [dragMode, setDragMode] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [visualOpen, setVisualOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [relayEditor, setRelayEditor] = useState<{ relay: Relay | null; deleting: boolean } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [contextEntry, setContextEntry] = useState<MobileEntry | null>(null);
  const [renamingEntry, setRenamingEntry] = useState<MobileEntry | null>(null);
  const [aliasTarget, setAliasTarget] = useState<{ kind: 'daemon'; agent: Agent } | { kind: 'session'; entry: Extract<MobileEntry, { kind: 'session' }> } | null>(null);
  const [linkTarget, setLinkTarget] = useState<{ agent: Agent; relay: Relay } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteEntry, setDeleteEntry] = useState<MobileEntry | null>(null);
  const [showOffline, setShowOffline] = useShowOfflineMachines();
  const gridRef = useRef<HTMLDivElement>(null);

  const entries = useMemo<MobileEntry[]>(() => {
    if (!currentAgentId) return [];
    return [
      ...(ptyAgentId === currentAgentId ? Object.values(sessionsById).map((session) => ({ key: sessionKey(session.id), kind: 'session' as const, agentId: currentAgentId, session })) : []),
      ...(workspaceAgentId === currentAgentId ? boardItems.map((item) => ({ key: boardKey(item.id), kind: 'board' as const, agentId: currentAgentId, item })) : []),
    ];
  }, [boardItems, currentAgentId, ptyAgentId, sessionsById, workspaceAgentId]);
  const entryMap = useMemo(() => new Map(entries.map((entry) => [entry.key, entry])), [entries]);
  const orderedEntries = useMemo(() => order.flatMap((key) => { const entry = entryMap.get(key); return entry ? [entry] : []; }), [entryMap, order]);
  const tabs = openTabIds.flatMap((key) => { const entry = entryMap.get(key); return entry ? [entry] : []; });
  const activeEntry = activeKey ? entryMap.get(activeKey) : undefined;

  useEffect(() => { setOrder((previous) => reconcileMobileOrder(previous, entries.map((entry) => entry.key))); }, [entries]);
  useEffect(() => { setActiveKey(null); }, [currentAgentId]);
  useEffect(() => {
    if (activeKey && !entryMap.has(activeKey)) setActiveKey(null);
  }, [activeKey, entryMap]);
  useEffect(() => {
    const handler = (event: Event) => {
      const next = Number((event as CustomEvent).detail?.iconsPerRow);
      if (Number.isFinite(next) && next >= 3 && next <= 8) setColumns(next);
    };
    window.addEventListener('ab-settings-change', handler);
    return () => window.removeEventListener('ab-settings-change', handler);
  }, []);

  const activate = useCallback((entry: MobileEntry) => {
    openTab(entry.key);
    setActiveKey(entry.key);
  }, [openTab]);

  const createEntry = async (type: 'terminal' | BoardItemType) => {
    if (!currentAgentId) return;
    setCreateOpen(false); setMenuOpen(false);
    if (type === 'terminal') {
      const result = await createPty({ agentId: currentAgentId, shellOnly: true });
      if (!result.ok) console.error(result.error);
      return;
    }
    try { await addBoardItem(type); } catch (error) { console.error(error); }
  };

  const confirmDelete = async () => {
    if (!deleteEntry) return;
    if (deleteEntry.kind === 'session') await killPty(deleteEntry.agentId, deleteEntry.session.id);
    else await removeBoardItem(deleteEntry.item.id);
    if (activeKey === deleteEntry.key) setActiveKey(null);
    setDeleteEntry(null);
  };

  const commitRename = async () => {
    if (!renamingEntry) return;
    const name = renameValue.trim();
    if (name && name !== mobileEntryTitle(renamingEntry) && renamingEntry.kind === 'board') updateBoardItem(renamingEntry.item.id, { label: name });
    setRenamingEntry(null);
  };

  const swapDraggedAtPoint = useCallback((clientX: number, clientY: number) => {
    if (!draggingKey || !gridRef.current) return;
    const cards = [...gridRef.current.querySelectorAll<HTMLElement>('[data-mobile-entry]')];
    const target = cards.find((card) => {
      const rect = card.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    });
    const targetKey = target?.dataset.mobileEntry;
    if (!targetKey || targetKey === draggingKey) return;
    setOrder((previous) => {
      const from = previous.indexOf(draggingKey); const to = previous.indexOf(targetKey);
      if (from < 0 || to < 0) return previous;
      const next = [...previous]; next.splice(from, 1); next.splice(to, 0, draggingKey); return next;
    });
  }, [draggingKey]);

  useEffect(() => {
    if (!draggingKey) return;
    const move = (event: PointerEvent) => { event.preventDefault(); swapDraggedAtPoint(event.clientX, event.clientY); };
    const end = () => setDraggingKey(null);
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', end);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); };
  }, [draggingKey, swapDraggedAtPoint]);

  const toggleDragMode = () => { setDragMode((value) => !value); setDeleteMode(false); setDraggingKey(null); };
  const toggleDeleteMode = () => { setDeleteMode((value) => !value); setDragMode(false); setDraggingKey(null); };
  const currentAgent = agents.find((agent) => agent.id === currentAgentId);
  const agentById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const canCreate = capabilities.relayRoutes || capabilities.files || capabilities.canvas || capabilities.tunnels;
  const supportsCreateType = (type: string) => type === 'terminal'
    ? capabilities.relayRoutes
    : type === 'filebrowser'
      ? capabilities.files
      : type === 'notes'
        ? capabilities.canvas
        : capabilities.tunnels;

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas-bg text-canvas-text" data-mobile-workspace>
      <header className="relative z-[60] flex h-10 shrink-0 items-center gap-2 border-b border-canvas-border bg-canvas-surface px-3">
        <button className="shrink-0 rounded p-0.5 hover:bg-canvas-border" title="Agent Bridge"><img src="/favicon.svg" alt="Agent Bridge" className="h-5 w-5" /></button>
        <div className="relative min-w-0 shrink">
          <button onClick={() => setAgentMenuOpen((value) => !value)} className="flex max-w-40 items-center gap-1 rounded border border-canvas-border bg-canvas-bg px-2 py-1 text-xs" title={currentAgent ? agentDisplayLabel(currentAgent, daemonDisplayName(currentAgent, daemonAliases)) : 'Select agent'}>
            <span className="truncate">{currentAgent ? agentDisplayLabel(currentAgent, daemonDisplayName(currentAgent, daemonAliases)) : 'Select'}</span><span className="text-canvas-muted">▾</span>
          </button>
          {agentMenuOpen && <>
            <button className="fixed inset-0 z-[70]" onClick={() => setAgentMenuOpen(false)} aria-label="Close agent menu" />
            <div className="absolute left-0 top-full z-[71] mt-1 max-h-[60vh] min-w-[240px] overflow-y-auto rounded border border-canvas-border bg-canvas-surface py-1 shadow-lg">
              <div className="flex items-center border-b border-canvas-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-canvas-muted">
                <span className="min-w-0 flex-1">Machines</span>
                <button
                  className={`rounded p-1 hover:bg-canvas-border ${showOffline ? 'text-canvas-accent' : 'text-canvas-muted'}`}
                  onClick={() => setShowOffline(!showOffline)}
                  title={showOffline ? 'Hide offline machines' : 'Show offline machines'}
                  aria-label={showOffline ? 'Hide offline machines' : 'Show offline machines'}
                  aria-pressed={showOffline}
                >
                  {showOffline ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
              </div>
              {relays.map((relay) => <div key={relay.id} className={!relay.enabled ? 'opacity-60' : ''}>
                <div className="flex items-center gap-2 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-canvas-muted">
                  <span className={`h-1.5 w-1.5 rounded-full ${relayCanConnect(relay) ? 'bg-green-400' : relay.enabled ? 'bg-amber-400' : 'bg-canvas-muted'}`} />
                  <span className="min-w-0 flex-1 truncate">{relay.name}</span><span className="font-normal normal-case">{relayStateLabel(relay)}</span>
                  {canAdministerRelays && <><button className="rounded p-0.5 hover:bg-canvas-border" onClick={() => { setRelayEditor({ relay, deleting: false }); setAgentMenuOpen(false); }} title={`Edit ${relay.name}`}><Pencil size={11} /></button><button className="rounded p-0.5 text-red-400 hover:bg-red-500/10" onClick={() => { setRelayEditor({ relay, deleting: true }); setAgentMenuOpen(false); }} title={`Delete ${relay.name}`}><Trash2 size={11} /></button></>}
                </div>
                {filterOfflineMachines(relay.machines, showOffline).map((machine) => {
                  const agent = agentById.get(machine.id); if (!agent) return null;
                  return <div key={agent.id} className={`flex w-full items-center text-xs ${agent.id === currentAgentId ? 'bg-canvas-accent/10 text-canvas-accent' : ''} ${!machine.online ? 'opacity-60' : ''}`}>
                    <button disabled={!relayCanConnect(relay) || !machine.online} onClick={() => { setCurrentAgent(agent.id); setAgentMenuOpen(false); }} className="flex min-w-0 flex-1 items-center gap-2 px-5 py-2 text-left hover:bg-canvas-border disabled:cursor-default"><span className={`h-1.5 w-1.5 rounded-full ${machine.online ? 'bg-emerald-500' : 'bg-canvas-muted'}`} /><span className="min-w-0 flex-1 truncate">{daemonDisplayName(agent, daemonAliases)}</span>{!machine.online && <span className="text-[9px]">offline</span>}</button>
                    {capabilities.daemonLinks && machine.online && <button className="rounded p-1 hover:bg-canvas-border" onClick={() => { setLinkTarget({ agent, relay }); setAgentMenuOpen(false); }} title={`Link ${agent.name} to another daemon`}><Link2 size={12} /></button>}
                    <button className="mr-2 rounded p-1 hover:bg-canvas-border" onClick={() => { setAliasTarget({ kind: 'daemon', agent }); setAgentMenuOpen(false); }} title={`Set local label for ${agent.name}`}><Pencil size={12} /></button>
                  </div>;
                })}
                {filterOfflineMachines(relay.machines, showOffline).length === 0 && <div className="px-5 py-2 text-[10px] text-canvas-muted">{!relay.enabled ? 'Relay disabled' : relay.machines.length > 0 ? 'Offline machines hidden' : 'No machines'}</div>}
              </div>)}
              {canAdministerRelays && <button onClick={() => { setRelayEditor({ relay: null, deleting: false }); setAgentMenuOpen(false); }} className="mt-1 flex w-full items-center gap-2 border-t border-canvas-border px-3 py-2 text-xs font-semibold text-canvas-accent hover:bg-canvas-border"><Plus size={14} />Add relay</button>}
            </div>
          </>}
        </div>
        <button onClick={() => setKeyboardVisible(!keyboardVisible)} className="shrink-0 rounded p-1 hover:bg-canvas-border" title="Touch keyboard"><Keyboard size={16} className={keyboardVisible ? 'text-canvas-accent' : 'text-canvas-muted'} /></button>
        <button onClick={toggleDragMode} className={`shrink-0 rounded p-1 ${dragMode ? 'bg-canvas-accent/20 ring-1 ring-canvas-accent' : 'hover:bg-canvas-border'}`} title="Reorder icons"><GripVertical size={16} className={dragMode ? 'text-canvas-accent' : 'text-canvas-muted'} /></button>
        <button onClick={toggleDeleteMode} className={`shrink-0 rounded p-1 ${deleteMode ? 'bg-red-500/20 ring-1 ring-red-500' : 'hover:bg-canvas-border'}`} title="Delete mode"><Trash2 size={16} className={deleteMode ? 'text-red-400' : 'text-canvas-muted'} /></button>
        <span className="min-w-0 flex-1" />
        <button onClick={() => setMenuOpen((value) => !value)} className="shrink-0 rounded p-1.5 hover:bg-canvas-border" title="Menu">{menuOpen ? <X size={18} className="text-canvas-muted" /> : <Menu size={18} className="text-canvas-muted" />}</button>
        {menuOpen && <><button className="fixed inset-0 z-[60]" onClick={() => setMenuOpen(false)} aria-label="Close menu" /><div className="absolute left-0 right-0 top-10 z-[61] border-b border-canvas-border bg-canvas-surface p-2 shadow-lg">
          {canCreate && <><div className="px-2 py-1 text-[10px] uppercase tracking-wider text-canvas-muted">Create</div><div className="flex gap-1 px-2">{[
            ['terminal', TerminalIcon, 'New terminal'], ['filebrowser', FolderOpen, 'Files'], ['notes', StickyNote, 'Note'], ['tunnels', Cable, 'Tunnels'],
          ].filter(([type]) => supportsCreateType(String(type))).map(([type, Icon, label]) => <button key={String(type)} onClick={() => void createEntry(type as 'terminal' | BoardItemType)} className="flex h-10 w-10 items-center justify-center rounded hover:bg-canvas-border" title={String(label)}><Icon size={18} className="text-canvas-accent" /></button>)}</div></>}
          <div className="my-1 h-px bg-canvas-border" /><div className="px-2 py-1 text-[10px] uppercase tracking-wider text-canvas-muted">Settings</div><div className="flex gap-1 px-2">
            <button onClick={() => { setVisualOpen(true); setMenuOpen(false); }} className="flex h-10 w-10 items-center justify-center rounded hover:bg-canvas-border" title="Visual"><Wrench size={18} className="text-canvas-accent" /></button>
            {management.account && <button onClick={() => { setAccountOpen(true); setMenuOpen(false); }} className="flex h-10 w-10 items-center justify-center rounded hover:bg-canvas-border" title="Account"><User size={18} className="text-canvas-accent" /></button>}
            {management.clientCertificates && <button onClick={() => { setAuthOpen(true); setMenuOpen(false); }} className="flex h-10 w-10 items-center justify-center rounded hover:bg-canvas-border" title="Authentication"><Lock size={18} className="text-canvas-accent" /></button>}
          </div><div className="my-1 h-px bg-canvas-border" /><button onClick={() => { setLogoutOpen(true); setMenuOpen(false); }} className="flex w-full items-center gap-2 rounded px-2 py-2 text-canvas-muted hover:bg-canvas-border"><LogOut size={16} /><span className="text-xs">Logout</span></button>
        </div></>}
      </header>
      <DiscoveryErrorBanner relayError={relayError} capabilitiesError={capabilitiesError} workspaceError={workspaceError} onRetry={() => void Promise.all([loadRelays(currentAgentId), loadCapabilities(), loadItems(currentAgentId)])} />

      <main className="relative min-h-0 flex-1">
        {!activeEntry ? <div className="h-full overflow-y-auto p-3" style={{ paddingBottom: TAB_HEIGHT + 12 }} data-mobile-canvas>
          <div ref={gridRef} className="grid justify-center gap-[6px]" style={{ gridTemplateColumns: `repeat(${columns}, 72px)`, touchAction: dragMode ? 'none' : undefined }}>
            {orderedEntries.map((entry) => <button key={entry.key} data-mobile-entry={entry.key} aria-label={mobileEntryDisplayTitle(entry, sessionAliases)} title={mobileEntryDisplayTitle(entry, sessionAliases)} onPointerDown={(event) => { if (dragMode) { event.preventDefault(); setDraggingKey(entry.key); } }} onClick={() => { if (dragMode) return; if (deleteMode) { setDeleteEntry(entry); return; } activate(entry); }} onContextMenu={(event) => { event.preventDefault(); if (!dragMode && !deleteMode) setContextEntry(entry); }} className={`relative flex h-[102px] w-[72px] select-none flex-col items-center justify-center rounded-xl ${activeKey === entry.key ? 'bg-canvas-accent/10' : 'bg-canvas-surface'} ${draggingKey === entry.key ? 'opacity-30' : ''} ${dragMode || deleteMode ? 'animate-[wiggle_0.3s_ease-in-out_infinite_alternate]' : 'active:opacity-70'}`}>
              {deleteMode && <span className="absolute -right-1 -top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-red-500"><X size={10} className="text-white" /></span>}
              <EntryIcon entry={entry} /><span className="mt-1 min-h-6 max-w-16 overflow-hidden text-center text-[10px] font-semibold leading-3" style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: MOBILE_TILE_LABEL_LINES }}>{mobileEntryDisplayTitle(entry, sessionAliases)}</span>
              <AgentActivityBadge entry={entry} className="mt-0.5 max-w-16" />
            </button>)}
            {canCreate && <button onClick={() => setCreateOpen(true)} className="flex h-[102px] w-[72px] items-center justify-center rounded-xl border border-dashed border-canvas-border active:opacity-70" title="Create"><Plus size={20} className="text-canvas-muted" /></button>}
          </div>
        </div> : <section key={`${activeEntry.key}-${refreshKey}`} className="absolute inset-0 flex min-h-0 flex-col bg-canvas-bg" style={{ bottom: TAB_HEIGHT }}>
          <div className="flex h-8 shrink-0 items-center gap-2 border-b border-canvas-border bg-canvas-surface px-3"><EntryIcon entry={activeEntry} size={12} /><span className="min-w-0 flex-1 truncate text-xs">{mobileEntryDisplayTitle(activeEntry, sessionAliases)}</span><AgentActivityBadge entry={activeEntry} className="max-w-32 shrink-0 text-[9px]" />{activeEntry.kind === 'session' && <TerminalAttachMenu agent={agentById.get(activeEntry.agentId)} ptyId={activeEntry.session.id} />}<button onClick={() => setRefreshKey((value) => value + 1)} className="rounded p-1 hover:bg-canvas-border" title="Refresh"><RotateCw size={13} className="text-canvas-muted" /></button><button onClick={() => setActiveKey(null)} className="rounded p-1 hover:bg-canvas-border" title="Canvas"><Minus size={14} className="text-canvas-muted" /></button></div>
          <div className="min-h-0 flex-1"><EntryBody entry={activeEntry} /></div>
        </section>}

        <nav className="absolute bottom-0 left-0 right-0 z-50 flex overflow-x-auto border-t border-canvas-border bg-canvas-surface" style={{ height: TAB_HEIGHT }} aria-label="Open workspace tabs">
          <button onClick={() => setActiveKey(null)} className={`flex h-full items-center gap-1.5 whitespace-nowrap border-r border-canvas-border px-3 text-xs ${!activeKey ? 'border-t-2 border-t-canvas-accent bg-canvas-bg text-canvas-accent' : 'text-canvas-muted'}`}><LayoutGrid size={12} />Canvas</button>
          {tabs.map((entry) => <button key={entry.key} onClick={() => setActiveKey(entry.key)} className={`flex h-full min-w-0 items-center gap-1.5 whitespace-nowrap border-r border-canvas-border px-3 text-xs ${activeKey === entry.key ? 'border-t-2 border-t-canvas-accent bg-canvas-bg text-canvas-accent' : 'text-canvas-muted'}`}><span className="truncate">{entry.kind === 'session' ? <TerminalIcon size={12} className="inline" /> : entry.item.type === 'notes' ? <StickyNote size={12} className="inline" /> : entry.item.type === 'filebrowser' ? <FolderOpen size={12} className="inline" /> : <Cable size={12} className="inline" />} {mobileEntryDisplayTitle(entry, sessionAliases)}</span><span onClick={(event) => { event.stopPropagation(); closeTab(entry.key); if (activeKey === entry.key) setActiveKey(null); }} className="rounded p-0.5 hover:bg-canvas-border"><X size={10} /></span></button>)}
        </nav>
      </main>

      {createOpen && canCreate && <><button className="fixed inset-0 z-[80] bg-black/50" onClick={() => setCreateOpen(false)} aria-label="Close create panel" /><div className="fixed bottom-0 left-0 right-0 z-[81] rounded-t-2xl border-t border-canvas-border bg-canvas-surface p-4 pb-8"><div className="mb-4 flex items-center justify-between"><span className="text-sm font-semibold">Create</span><button onClick={() => setCreateOpen(false)}><X size={16} /></button></div><div className="grid grid-cols-4 gap-3">{[
        ['terminal', TerminalIcon, 'Terminal'], ['filebrowser', FolderOpen, 'Files'], ['notes', StickyNote, 'Note'], ['tunnels', Cable, 'Tunnels'],
      ].filter(([type]) => supportsCreateType(String(type))).map(([type, Icon, label]) => <button key={String(type)} onClick={() => void createEntry(type as 'terminal' | BoardItemType)} className="flex flex-col items-center gap-2 rounded-xl p-3 hover:bg-canvas-border"><Icon size={28} className="text-canvas-accent" /><span className="text-[11px]">{String(label)}</span></button>)}</div></div></>}

      {contextEntry && <><button className="fixed inset-0 z-[80]" onClick={() => setContextEntry(null)} aria-label="Close item menu" /><div className="fixed bottom-12 left-3 right-3 z-[81] rounded-xl border border-canvas-border bg-canvas-surface p-1 shadow-xl"><button onClick={() => { if (contextEntry.kind === 'session') setAliasTarget({ kind: 'session', entry: contextEntry }); else { setRenamingEntry(contextEntry); setRenameValue(contextEntry.item.label); } setContextEntry(null); }} className="flex w-full items-center gap-2 rounded px-3 py-3 text-xs hover:bg-canvas-border"><Pencil size={14} />{contextEntry.kind === 'session' ? 'Local label' : 'Rename'}</button><button onClick={() => { setDeleteEntry(contextEntry); setContextEntry(null); }} className="flex w-full items-center gap-2 rounded px-3 py-3 text-xs text-red-400 hover:bg-red-500/10"><Trash2 size={14} />Delete</button></div></>}
      {renamingEntry && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 px-4"><div className="w-full max-w-xs rounded-xl border border-canvas-border bg-canvas-surface p-4"><div className="mb-3 text-sm font-semibold">Rename</div><input autoFocus value={renameValue} onChange={(event) => setRenameValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void commitRename(); if (event.key === 'Escape') setRenamingEntry(null); }} className="w-full rounded border border-canvas-border bg-canvas-bg px-3 py-2 text-xs outline-none focus:border-canvas-accent" /><div className="mt-3 flex justify-end gap-2"><button onClick={() => setRenamingEntry(null)} className="rounded border border-canvas-border px-3 py-1.5 text-xs">Cancel</button><button onClick={() => void commitRename()} className="rounded border border-canvas-accent bg-canvas-accent/20 px-3 py-1.5 text-xs text-canvas-accent">Save</button></div></div></div>}

      <ClientAliasDialog
        open={aliasTarget !== null}
        kind={aliasTarget?.kind === 'daemon' ? 'daemon' : 'PTY instance'}
        realName={aliasTarget?.kind === 'daemon' ? aliasTarget.agent.name : aliasTarget?.entry.session.name || ''}
        immutableId={aliasTarget?.kind === 'daemon' ? aliasTarget.agent.id : aliasTarget?.entry.session.id || ''}
        alias={aliasTarget?.kind === 'daemon' ? daemonAliases[aliasTarget.agent.id] || '' : aliasTarget ? sessionAliases[sessionAliasKey(aliasTarget.entry.agentId, aliasTarget.entry.session.id)] || '' : ''}
        onSave={(alias) => { if (aliasTarget?.kind === 'daemon') setDaemonAlias(aliasTarget.agent.id, alias); else if (aliasTarget) setSessionAlias(aliasTarget.entry.agentId, aliasTarget.entry.session.id, alias); }}
        onClose={() => setAliasTarget(null)}
      />
      <DaemonLinkDialog
        open={linkTarget !== null}
        source={linkTarget?.agent || null}
        relay={linkTarget?.relay || null}
        candidates={linkTarget ? agents.filter((agent) => agent.relay_id === linkTarget.relay.id && agent.fingerprint !== linkTarget.agent.fingerprint && agent.online) : []}
        onClose={() => setLinkTarget(null)}
      />

      <MobileVisualPanel open={visualOpen} onClose={() => setVisualOpen(false)} />
      {management.account && <MobileAccountPanel open={accountOpen} onClose={() => setAccountOpen(false)} />}
      {management.clientCertificates && <MobileAuthPanel open={authOpen} onClose={() => setAuthOpen(false)} />}
      {canAdministerRelays && <RelayAdminModal open={relayEditor !== null} relay={relayEditor?.relay || null} revision={relayRevision} confirmDeleteOnOpen={relayEditor?.deleting} onClose={() => setRelayEditor(null)} onChanged={() => loadRelays(currentAgentId)} />}
      {logoutOpen && <LogoutDialog onCancel={() => setLogoutOpen(false)} onConfirm={() => void logoutRequest().then(() => { authLogout(); window.location.reload(); })} />}
      <ConfirmDialog open={!!deleteEntry} title={deleteEntry ? `${deleteEntry.kind === 'session' ? 'Kill' : 'Delete'} "${mobileEntryDisplayTitle(deleteEntry, sessionAliases)}"?` : ''} message={deleteEntry?.kind === 'session' ? `This terminates the live PTY session. Real name: ${deleteEntry.session.name}` : 'This removes the workspace resource.'} confirmLabel={deleteEntry?.kind === 'session' ? 'Kill' : 'Delete'} confirmTone="danger" onConfirm={() => void confirmDelete()} onClose={() => setDeleteEntry(null)} />
    </div>
  );
}
