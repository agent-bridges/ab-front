import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp, Cable, ChevronDown, ChevronRight, Columns2, FolderOpen, Keyboard, Link2,
  LayoutGrid, Menu, Pencil, Plus, StickyNote, Terminal as TerminalIcon,
  Trash2, Wrench, X,
} from 'lucide-react';
import { useAgentStore } from '../stores/agentStore';
import { useKeyboardStore } from '../stores/keyboardStore';
import { usePtyStore } from '../stores/ptyStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useIsMobile } from '../hooks/useIsMobile';
import { createPty, killPty } from '../api/pty';
import SettingsModal from '../components/SettingsModal';
import ConfirmDialog from '../components/dialogs/ConfirmDialog';
import type { BoardItemType, IdeGroupLayout } from '../types';
import DesktopEntryPane, {
  type WorkspaceEntry,
  workspaceEntryDisplayTitle,
  workspaceEntryTitle,
  WorkspaceEntryIcon as EntryIcon,
} from './DesktopEntryPane';
import { managementEntrypointsForCapabilities, useCapabilities } from '../hooks/useCapabilities';
import { agentDisplayLabel, relayCanConnect, relayStateLabel } from '../utils/agentDisplay';
import { useCapabilitiesStore } from '../stores/capabilitiesStore';
import DiscoveryErrorBanner from '../components/DiscoveryErrorBanner';
import RelayAdminModal from '../components/RelayAdminModal';
import type { Relay } from '../types';
import type { Agent } from '../types';
import ClientAliasDialog from '../components/ClientAliasDialog';
import { daemonDisplayName, sessionAliasKey, useClientAliasStore } from '../stores/clientAliasStore';
import { getAgentActivityLabel, getTerminalStatusMeta } from '../components/ProcessIndicator';
import DaemonLinkDialog from '../components/DaemonLinkDialog';

const sessionKey = (id: string) => `session:${id}`;
const boardKey = (id: string) => `board:${id}`;

export const DESKTOP_TREE_DEPTH_CLASSES = {
  relayRow: 'px-2',
  daemonBranch: 'ml-4 border-l border-canvas-border/70',
  daemonRow: 'pl-3 pr-2',
  childrenBranch: 'ml-4 border-l border-canvas-border pl-3',
} as const;

export function claimInitialPaneForAgent(
  visitedAgents: Set<string>,
  agentId: string,
  focusedPaneIsValid: boolean,
  hasEntry: boolean,
): boolean {
  if (focusedPaneIsValid) {
    visitedAgents.add(agentId);
    return false;
  }
  if (visitedAgents.has(agentId) || !hasEntry) return false;
  visitedAgents.add(agentId);
  return true;
}

export function workspaceEntriesForAgent({
  currentAgentId,
  ptyAgentId,
  sessionsById,
  workspaceAgentId,
  boardItems,
}: {
  currentAgentId: string | null;
  ptyAgentId: string | null;
  sessionsById: Record<string, import('../types').PtySession>;
  workspaceAgentId: string | null;
  boardItems: import('../types').BoardItem[];
}): WorkspaceEntry[] {
  if (!currentAgentId) return [];
  const sessions = ptyAgentId === currentAgentId
    ? Object.values(sessionsById).map((session) => ({ key: sessionKey(session.id), kind: 'session' as const, agentId: currentAgentId, session }))
    : [];
  const resources = workspaceAgentId === currentAgentId
    ? boardItems.map((item) => ({ key: boardKey(item.id), kind: 'board' as const, agentId: currentAgentId, item }))
    : [];
  return [...sessions, ...resources];
}

function RenameInput({ value, onSave, onCancel }: { value: string; onSave: (name: string) => Promise<void> | void; onCancel: () => void }) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const save = async () => {
    const next = draft.trim();
    if (!next || next === value) { onCancel(); return; }
    setBusy(true); setError('');
    try { await onSave(next); onCancel(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); setBusy(false); }
  };
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <input ref={ref} value={draft} disabled={busy} onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') void save(); if (event.key === 'Escape') onCancel(); }}
        onBlur={() => { if (!error) void save(); }}
        className="min-w-0 rounded border border-canvas-accent bg-canvas-bg px-1 text-xs text-canvas-text outline-none" />
      {error && <span className="mt-0.5 truncate text-[9px] text-red-400" title={error}>{error}</span>}
    </span>
  );
}

function GroupBody({ entries, layout, onHide, onDelete }: { entries: WorkspaceEntry[]; layout: IdeGroupLayout; onHide: (entry: WorkspaceEntry) => void; onDelete: (entry: WorkspaceEntry) => void }) {
  const style = layout === 'h2' || layout === 'h3'
    ? { gridTemplateRows: `repeat(${entries.length}, minmax(0, 1fr))`, gridTemplateColumns: 'minmax(0, 1fr)' }
    : layout === 'grid'
      ? { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gridAutoRows: 'minmax(0, 1fr)' }
      : { gridTemplateColumns: `repeat(${entries.length}, minmax(0, 1fr))`, gridTemplateRows: 'minmax(0, 1fr)' };
  return (
    <div className="grid min-h-0 flex-1 gap-1 bg-canvas-border p-1" style={style}>
      {entries.map((entry) => (
        <div key={entry.key} className="flex min-h-0 min-w-0 flex-col bg-canvas-bg">
          <DesktopEntryPane entry={entry} onHide={() => onHide(entry)} onDelete={() => onDelete(entry)} />
        </div>
      ))}
    </div>
  );
}

export default function Workspace() {
  const isMobile = useIsMobile();
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
  const connected = usePtyStore((state) => state.connected);
  const daemonAliases = useClientAliasStore((state) => state.daemons);
  const sessionAliases = useClientAliasStore((state) => state.sessions);
  const setDaemonAlias = useClientAliasStore((state) => state.setDaemonAlias);
  const setSessionAlias = useClientAliasStore((state) => state.setSessionAlias);
  const boardItems = useWorkspaceStore((state) => state.boardItems);
  const workspaceAgentId = useWorkspaceStore((state) => state.agentId);
  const sort = useWorkspaceStore((state) => state.sort);
  const sidebarWidth = useWorkspaceStore((state) => state.sidebarWidth);
  const openTabIds = useWorkspaceStore((state) => state.openTabIds);
  const focusedItemId = useWorkspaceStore((state) => state.focusedItemId);
  const groups = useWorkspaceStore((state) => state.groups);
  const setSort = useWorkspaceStore((state) => state.setSort);
  const setSidebarWidth = useWorkspaceStore((state) => state.setSidebarWidth);
  const openTab = useWorkspaceStore((state) => state.openTab);
  const closeTab = useWorkspaceStore((state) => state.closeTab);
  const addBoardItem = useWorkspaceStore((state) => state.addBoardItem);
  const updateBoardItem = useWorkspaceStore((state) => state.updateBoardItem);
  const removeBoardItem = useWorkspaceStore((state) => state.removeBoardItem);
  const createGroup = useWorkspaceStore((state) => state.createGroup);
  const deleteGroup = useWorkspaceStore((state) => state.deleteGroup);
  const renameGroup = useWorkspaceStore((state) => state.renameGroup);
  const removeGroupMember = useWorkspaceStore((state) => state.removeGroupMember);
  const setGroupLayout = useWorkspaceStore((state) => state.setGroupLayout);
  const keyboardVisible = useKeyboardStore((state) => state.keyboard.visible);
  const setKeyboardVisible = useKeyboardStore((state) => state.setKeyboardVisible);

  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [relayEditor, setRelayEditor] = useState<{ relay: Relay | null; deleting: boolean } | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [aliasTarget, setAliasTarget] = useState<{ kind: 'daemon'; agent: Agent } | { kind: 'session'; entry: Extract<WorkspaceEntry, { kind: 'session' }> } | null>(null);
  const [linkTarget, setLinkTarget] = useState<{ agent: Agent; relay: Relay } | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<WorkspaceEntry | null>(null);
  const [query, setQuery] = useState('');
  const agentById = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const autoOpenedAgentsRef = useRef<Set<string>>(new Set());
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('ab:workspace:expanded-agents') || '[]') as string[]); }
    catch { return new Set(); }
  });
  const resizeRef = useRef<{ x: number; width: number } | null>(null);

  useEffect(() => { setSidebarOpen(!isMobile); }, [isMobile]);
  useEffect(() => { localStorage.setItem('ab:workspace:expanded-agents', JSON.stringify([...expandedAgents])); }, [expandedAgents]);
  useEffect(() => {
    if (currentAgentId) setExpandedAgents((current) => new Set([...current, currentAgentId]));
  }, [currentAgentId]);

  const entries = useMemo<WorkspaceEntry[]>(() => {
    const combined = workspaceEntriesForAgent({ currentAgentId, ptyAgentId, sessionsById, workspaceAgentId, boardItems });
    return combined.sort((a, b) => {
      if (sort === 'type' && a.kind !== b.kind) return a.kind === 'session' ? -1 : 1;
      if (sort === 'status' && a.kind === 'session' && b.kind === 'session') return Number(!a.session.alive) - Number(!b.session.alive);
      if (sort === 'recent' && a.kind === 'session' && b.kind === 'session') return b.session.created_at.localeCompare(a.session.created_at);
      return workspaceEntryDisplayTitle(a, sessionAliases).localeCompare(workspaceEntryDisplayTitle(b, sessionAliases), undefined, { sensitivity: 'base' });
    });
  }, [boardItems, currentAgentId, ptyAgentId, sessionAliases, sessionsById, sort, workspaceAgentId]);
  const entryMap = useMemo(() => new Map(entries.map((entry) => [entry.key, entry])), [entries]);
  const groupMap = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
  const visibleEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? entries.filter((entry) => workspaceEntryDisplayTitle(entry, sessionAliases).toLowerCase().includes(normalized) || workspaceEntryTitle(entry).toLowerCase().includes(normalized)) : entries;
  }, [entries, query, sessionAliases]);
  const tabs = openTabIds.filter((id) => entryMap.has(id) || groupMap.has(id));
  const focusedEntry = focusedItemId ? entryMap.get(focusedItemId) : undefined;
  const focusedGroup = focusedItemId ? groupMap.get(focusedItemId) : undefined;

  useEffect(() => {
    if (!currentAgentId) return;
    const focusedPaneIsValid = Boolean(focusedItemId && (entryMap.has(focusedItemId) || groupMap.has(focusedItemId)));
    // Pick a useful initial pane once per agent. After the user explicitly
    // hides the final tab, keep the workspace empty even after A -> B -> A.
    const first = entries[0];
    if (claimInitialPaneForAgent(autoOpenedAgentsRef.current, currentAgentId, focusedPaneIsValid, Boolean(first)) && first) {
      openTab(first.key);
    }
  }, [currentAgentId, entries, entryMap, focusedItemId, groupMap, openTab]);

  const addResource = async (type: BoardItemType) => {
    try { await addBoardItem(type); } catch (error) { console.error(error); }
  };
  const newTerminal = async () => {
    if (!currentAgentId) return;
    const result = await createPty({ agentId: currentAgentId, shellOnly: true });
    if (!result.ok) console.error(result.error);
  };
  const confirmDelete = async () => {
    if (!deleteEntry) return;
    if (deleteEntry.kind === 'session') await killPty(deleteEntry.agentId, deleteEntry.session.id);
    else await removeBoardItem(deleteEntry.item.id);
    setDeleteEntry(null);
  };

  const sidebar = (
    <aside className={`${isMobile ? 'fixed inset-y-10 left-0 z-50 shadow-2xl' : 'relative'} flex min-h-0 flex-col border-r border-canvas-border bg-canvas-surface`} style={{ width: isMobile ? 'min(88vw, 340px)' : sidebarWidth }}>
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-canvas-border px-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter sessions and tools"
          className="min-w-0 flex-1 rounded border border-canvas-border bg-canvas-bg px-2 py-1 text-xs text-canvas-text outline-none focus:border-canvas-accent" />
        <button className="rounded p-1 hover:bg-canvas-border" onClick={() => setSort(sort === 'type' ? 'name' : sort === 'name' ? 'recent' : sort === 'recent' ? 'status' : 'type')} title={`Sort: ${sort}`}><ArrowDownUp size={13} /></button>
        {canAdministerRelays && <button className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-semibold text-canvas-accent hover:bg-canvas-border" onClick={() => setRelayEditor({ relay: null, deleting: false })} title="Add relay"><Plus size={12} />Relay</button>}
        {isMobile && <button className="rounded p-1 hover:bg-canvas-border" onClick={() => setSidebarOpen(false)}><X size={14} /></button>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {relays.map((relay) => <div key={relay.id} className={!relay.enabled ? 'opacity-60' : ''}>
          <div className={`flex min-h-7 items-center gap-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-canvas-muted ${DESKTOP_TREE_DEPTH_CLASSES.relayRow}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${relayCanConnect(relay) ? 'bg-green-400' : relay.enabled ? 'bg-amber-400' : 'bg-canvas-muted'}`} />
            <span className="min-w-0 flex-1 truncate">{relay.name}</span>
            <span className="font-normal normal-case">{relayStateLabel(relay)}</span>
            {canAdministerRelays && <><button className="rounded p-0.5 hover:bg-canvas-border" onClick={() => setRelayEditor({ relay, deleting: false })} title={`Edit ${relay.name}`}><Pencil size={11} /></button><button className="rounded p-0.5 text-red-400 hover:bg-red-500/10" onClick={() => setRelayEditor({ relay, deleting: true })} title={`Delete ${relay.name}`}><Trash2 size={11} /></button></>}
          </div>
          {relay.machines.map((machine) => {
          const agent = agentById.get(machine.id);
          if (!agent) return null;
          const current = agent.id === currentAgentId;
          const expanded = expandedAgents.has(agent.id);
          return <div key={agent.id} className={DESKTOP_TREE_DEPTH_CLASSES.daemonBranch}>
            <div className={`group flex h-7 w-full items-center ${DESKTOP_TREE_DEPTH_CLASSES.daemonRow} ${current ? 'text-canvas-accent' : 'text-canvas-text'} ${!machine.online ? 'opacity-60' : ''}`}>
            <button disabled={!relayCanConnect(relay) || !machine.online} className="flex min-w-0 flex-1 items-center gap-1 text-left text-xs hover:bg-canvas-border disabled:cursor-default"
              onClick={() => { setExpandedAgents((set) => { const next = new Set(set); expanded ? next.delete(agent.id) : next.add(agent.id); return next; }); if (!current) setCurrentAgent(agent.id); }}>
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<span className={`h-1.5 w-1.5 rounded-full ${current && connected ? 'bg-green-400' : machine.online ? 'bg-emerald-500/70' : 'bg-canvas-muted'}`} /><span className="truncate font-medium">{daemonDisplayName(agent, daemonAliases)}</span>{!machine.online && <span className="ml-auto text-[9px] text-canvas-muted">offline</span>}
            </button>
            {capabilities.daemonLinks && machine.online && <button className="hidden shrink-0 rounded p-1 group-hover:block hover:bg-canvas-border" onClick={() => setLinkTarget({ agent, relay })} title={`Link ${agent.name} to another daemon`}><Link2 size={10} /></button>}
            <button className="hidden shrink-0 rounded p-1 group-hover:block hover:bg-canvas-border" onClick={() => setAliasTarget({ kind: 'daemon', agent })} title={`Set local label for ${agent.name}`}><Pencil size={10} /></button>
            </div>
            {expanded && current && <div className={DESKTOP_TREE_DEPTH_CLASSES.childrenBranch}>
              {visibleEntries.map((entry) => { const activity = entry.kind === 'session' ? getAgentActivityLabel(getTerminalStatusMeta(entry.session.alive, entry.session.processes, entry.session.ai_status)) : null; return <div key={entry.key} className={`group flex min-h-7 items-center gap-2 rounded px-2 text-xs hover:bg-canvas-border ${focusedItemId === entry.key ? 'bg-canvas-accent/15 text-canvas-accent' : 'text-canvas-text'}`}>
                <button className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left" onClick={() => { openTab(entry.key); if (isMobile) setSidebarOpen(false); }} onDoubleClick={() => entry.kind === 'session' ? setAliasTarget({ kind: 'session', entry }) : setEditingKey(entry.key)}>
                  <EntryIcon entry={entry} />
                  {editingKey === entry.key && entry.kind === 'board' ? <RenameInput value={entry.item.label} onCancel={() => setEditingKey(null)} onSave={(name) => updateBoardItem(entry.item.id, { label: name })} /> : <><span className="min-w-0 flex-1 truncate">{workspaceEntryDisplayTitle(entry, sessionAliases)}</span>{activity && <span className={`max-w-32 shrink-0 truncate text-[9px] ${activity.className}`} title={activity.text}>{activity.text}</span>}</>}
                </button>
                {editingKey !== entry.key && <><button className="hidden rounded p-0.5 group-hover:block" onClick={() => entry.kind === 'session' ? setAliasTarget({ kind: 'session', entry }) : setEditingKey(entry.key)}><Pencil size={10} /></button><button className="hidden rounded p-0.5 text-red-400 group-hover:block" onClick={() => setDeleteEntry(entry)}><Trash2 size={10} /></button></>}
              </div>; })}
              {visibleEntries.length === 0 && <div className="px-3 py-2 text-[11px] text-canvas-muted">No matching entries</div>}
            </div>}
          </div>;
          })}
          {relay.machines.length === 0 && <div className={`${DESKTOP_TREE_DEPTH_CLASSES.daemonBranch} ${DESKTOP_TREE_DEPTH_CLASSES.daemonRow} py-1.5 text-[10px] text-canvas-muted`}>{relay.enabled ? 'No machines' : 'Relay disabled'}</div>}
        </div>)}
      </div>
      {!isMobile && <div className="absolute inset-y-0 -right-1 w-2 cursor-col-resize" onPointerDown={(event) => { resizeRef.current = { x: event.clientX, width: sidebarWidth }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (resizeRef.current) setSidebarWidth(resizeRef.current.width + event.clientX - resizeRef.current.x); }} onPointerUp={() => { resizeRef.current = null; }} />}
    </aside>
  );

  return <div className="flex h-full min-h-0 flex-col bg-canvas-bg text-canvas-text">
    <header className="flex h-10 shrink-0 items-center gap-1 border-b border-canvas-border bg-canvas-surface px-2">
      {isMobile && <button className="rounded p-1.5 hover:bg-canvas-border" onClick={() => setSidebarOpen(true)}><Menu size={16} /></button>}
      <select value={currentAgentId || ''} onChange={(event) => setCurrentAgent(event.target.value)} className="max-w-56 rounded border border-canvas-border bg-canvas-bg px-2 py-1 text-xs">
        <option value="" disabled>Agent</option>
        {relays.map((relay) => <optgroup key={relay.id} label={`${relay.name} — ${relayStateLabel(relay)}`}>
          {relay.machines.length === 0
            ? <option disabled value={`${relay.id}:empty`}>No machines</option>
            : relay.machines.map((machine) => {
              const agent = agentById.get(machine.id);
              return <option key={machine.id} value={machine.id} disabled={!relayCanConnect(relay) || !machine.online}>{agent ? agentDisplayLabel(agent, daemonDisplayName(agent, daemonAliases)) : machine.name}{!machine.online ? ' — offline' : ''}</option>;
            })}
        </optgroup>)}
      </select>
      {capabilities.relayRoutes && <button className="rounded p-1.5 hover:bg-canvas-border" onClick={() => void newTerminal()} title="New terminal"><TerminalIcon size={15} /></button>}
      {capabilities.files && <button className="rounded p-1.5 hover:bg-canvas-border" onClick={() => void addResource('filebrowser')} title="Open files"><FolderOpen size={15} /></button>}
      {capabilities.canvas && <button className="rounded p-1.5 hover:bg-canvas-border" onClick={() => void addResource('notes')} title="New note"><StickyNote size={15} /></button>}
      {capabilities.tunnels && <button className="rounded p-1.5 hover:bg-canvas-border" onClick={() => void addResource('tunnels')} title="Open tunnels"><Cable size={15} /></button>}
      <span className="flex-1" />
      <button disabled={tabs.filter((id) => entryMap.has(id)).length < 2} className="rounded p-1.5 hover:bg-canvas-border disabled:opacity-30" onClick={() => createGroup(tabs.filter((id) => entryMap.has(id)))} title="Group open tabs"><Columns2 size={15} /></button>
      <button className="rounded p-1.5 hover:bg-canvas-border" onClick={() => setKeyboardVisible(!keyboardVisible)} title="Touch keyboard"><Keyboard size={15} /></button>
      <button className="rounded p-1.5 hover:bg-canvas-border" onClick={() => setSettingsOpen(true)} title="Settings"><Wrench size={15} /></button>
    </header>
    <DiscoveryErrorBanner relayError={relayError} capabilitiesError={capabilitiesError} workspaceError={workspaceError} onRetry={() => void Promise.all([loadRelays(currentAgentId), loadCapabilities(), loadItems(currentAgentId)])} />
    <div className="relative flex min-h-0 flex-1">
      {sidebarOpen && sidebar}
      {isMobile && sidebarOpen && <button className="fixed inset-0 top-10 z-40 bg-black/50" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar" />}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 overflow-x-auto border-b border-canvas-border bg-canvas-surface">
          {tabs.map((id) => {
            const entry = entryMap.get(id); const group = groupMap.get(id); const title = entry ? workspaceEntryDisplayTitle(entry, sessionAliases) : group?.name || id;
            return <button key={id} onClick={() => openTab(id)} className={`group flex min-w-28 max-w-52 items-center gap-2 border-r border-canvas-border px-2 text-xs ${focusedItemId === id ? 'bg-canvas-bg text-canvas-accent' : 'text-canvas-muted hover:bg-canvas-border'}`}>
              {entry ? <EntryIcon entry={entry} /> : <LayoutGrid size={13} />}<span className="flex-1 truncate text-left">{title}</span><span onClick={(event) => { event.stopPropagation(); closeTab(id); }} className="rounded p-0.5 hover:bg-canvas-border"><X size={11} /></span>
            </button>;
          })}
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          {focusedEntry ? <DesktopEntryPane entry={focusedEntry} active onHide={() => closeTab(focusedEntry.key)} onDelete={() => setDeleteEntry(focusedEntry)} /> : focusedGroup ? <>
            <div className="flex h-8 shrink-0 items-center gap-2 border-b border-canvas-border bg-canvas-surface px-2">
              <input value={focusedGroup.name} onChange={(event) => renameGroup(focusedGroup.id, event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs outline-none" />
              <select value={focusedGroup.layout} onChange={(event) => setGroupLayout(focusedGroup.id, event.target.value as IdeGroupLayout)} className="rounded border border-canvas-border bg-canvas-bg px-1 text-xs"><option value="v2">Columns</option><option value="h2">Rows</option><option value="grid">Grid</option></select>
              <button onClick={() => deleteGroup(focusedGroup.id)} className="rounded p-1 text-red-400 hover:bg-red-500/10"><Trash2 size={12} /></button>
            </div>
            <GroupBody entries={focusedGroup.members.flatMap((id) => { const entry = entryMap.get(id); return entry ? [entry] : []; })} layout={focusedGroup.layout} onHide={(entry) => removeGroupMember(focusedGroup.id, entry.key)} onDelete={setDeleteEntry} />
          </> : <div className="flex flex-1 items-center justify-center text-sm text-canvas-muted"><div className="text-center"><TerminalIcon size={30} className="mx-auto mb-3 opacity-40" /><div>Select a session from the workspace tree.</div>{capabilities.relayRoutes && <button className="mt-3 rounded border border-canvas-border px-3 py-1.5 text-xs hover:bg-canvas-border" onClick={() => void newTerminal()}><Plus size={12} className="mr-1 inline" />New terminal</button>}</div></div>}
        </div>
      </main>
    </div>
    {canAdministerRelays && <RelayAdminModal open={relayEditor !== null} relay={relayEditor?.relay || null} revision={relayRevision} confirmDeleteOnOpen={relayEditor?.deleting} onClose={() => setRelayEditor(null)} onChanged={() => loadRelays(currentAgentId)} />}
    <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
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
    <ConfirmDialog open={!!deleteEntry} title={deleteEntry ? `${deleteEntry.kind === 'session' ? 'Kill' : 'Delete'} "${workspaceEntryDisplayTitle(deleteEntry, sessionAliases)}"?` : ''} message={deleteEntry?.kind === 'session' ? `This terminates the live PTY session. Real name: ${deleteEntry.session.name}` : 'This removes the workspace resource.'} confirmLabel={deleteEntry?.kind === 'session' ? 'Kill' : 'Delete'} confirmTone="danger" onConfirm={() => void confirmDelete()} onClose={() => setDeleteEntry(null)} />
  </div>;
}
