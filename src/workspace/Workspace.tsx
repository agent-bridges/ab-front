import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp, Cable, ChevronDown, ChevronRight, Columns2, FolderOpen, Keyboard,
  LayoutGrid, Menu, Pencil, Plus, Settings2, StickyNote, Terminal as TerminalIcon,
  Trash2, Wrench, X,
} from 'lucide-react';
import { useAgentStore } from '../stores/agentStore';
import { useKeyboardStore } from '../stores/keyboardStore';
import { usePtyStore } from '../stores/ptyStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useIsMobile } from '../hooks/useIsMobile';
import { createPty, killPty } from '../api/pty';
import ConnectionSettingsModal from '../components/ConnectionSettingsModal';
import SettingsModal from '../components/SettingsModal';
import ConfirmDialog from '../components/dialogs/ConfirmDialog';
import type { BoardItemType, IdeGroupLayout } from '../types';
import DesktopEntryPane, {
  type WorkspaceEntry,
  workspaceEntryTitle as entryTitle,
  WorkspaceEntryIcon as EntryIcon,
} from './DesktopEntryPane';
import { managementEntrypointsForCapabilities, useCapabilities } from '../hooks/useCapabilities';

const sessionKey = (id: string) => `session:${id}`;
const boardKey = (id: string) => `board:${id}`;

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
  const currentAgentId = useAgentStore((state) => state.currentAgentId);
  const setCurrentAgent = useAgentStore((state) => state.setCurrentAgent);
  const sessionsById = usePtyStore((state) => state.sessionsById);
  const ptyAgentId = usePtyStore((state) => state.agentId);
  const connected = usePtyStore((state) => state.connected);
  const renameSession = usePtyStore((state) => state.renameSession);
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
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<WorkspaceEntry | null>(null);
  const [query, setQuery] = useState('');
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
      return entryTitle(a).localeCompare(entryTitle(b), undefined, { sensitivity: 'base' });
    });
  }, [boardItems, currentAgentId, ptyAgentId, sessionsById, sort, workspaceAgentId]);
  const entryMap = useMemo(() => new Map(entries.map((entry) => [entry.key, entry])), [entries]);
  const groupMap = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
  const visibleEntries = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized ? entries.filter((entry) => entryTitle(entry).toLowerCase().includes(normalized)) : entries;
  }, [entries, query]);
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
        {isMobile && <button className="rounded p-1 hover:bg-canvas-border" onClick={() => setSidebarOpen(false)}><X size={14} /></button>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {agents.map((agent) => {
          const current = agent.id === currentAgentId;
          const expanded = expandedAgents.has(agent.id);
          return <div key={agent.id}>
            <button className={`flex h-7 w-full items-center gap-1 px-2 text-left text-xs hover:bg-canvas-border ${current ? 'text-canvas-accent' : 'text-canvas-text'}`}
              onClick={() => { setExpandedAgents((set) => { const next = new Set(set); expanded ? next.delete(agent.id) : next.add(agent.id); return next; }); if (!current) setCurrentAgent(agent.id); }}>
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<span className={`h-1.5 w-1.5 rounded-full ${current && connected ? 'bg-green-400' : 'bg-canvas-muted'}`} /><span className="truncate font-medium">{agent.name}</span>
            </button>
            {expanded && current && <div className="ml-3 border-l border-canvas-border pl-1">
              {visibleEntries.map((entry) => <div key={entry.key} className={`group flex min-h-7 items-center gap-2 rounded px-2 text-xs hover:bg-canvas-border ${focusedItemId === entry.key ? 'bg-canvas-accent/15 text-canvas-accent' : 'text-canvas-text'}`}>
                <button className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left" onClick={() => { openTab(entry.key); if (isMobile) setSidebarOpen(false); }} onDoubleClick={() => setEditingKey(entry.key)}>
                  <EntryIcon entry={entry} />
                  {editingKey === entry.key ? <RenameInput value={entryTitle(entry)} onCancel={() => setEditingKey(null)} onSave={(name) => entry.kind === 'session' ? renameSession(entry.agentId, entry.session.id, name) : updateBoardItem(entry.item.id, { label: name })} /> : <span className="truncate">{entryTitle(entry)}</span>}
                </button>
                {editingKey !== entry.key && <><button className="hidden rounded p-0.5 group-hover:block" onClick={() => setEditingKey(entry.key)}><Pencil size={10} /></button><button className="hidden rounded p-0.5 text-red-400 group-hover:block" onClick={() => setDeleteEntry(entry)}><Trash2 size={10} /></button></>}
              </div>)}
              {visibleEntries.length === 0 && <div className="px-3 py-2 text-[11px] text-canvas-muted">No matching entries</div>}
            </div>}
          </div>;
        })}
      </div>
      {!isMobile && <div className="absolute inset-y-0 -right-1 w-2 cursor-col-resize" onPointerDown={(event) => { resizeRef.current = { x: event.clientX, width: sidebarWidth }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (resizeRef.current) setSidebarWidth(resizeRef.current.width + event.clientX - resizeRef.current.x); }} onPointerUp={() => { resizeRef.current = null; }} />}
    </aside>
  );

  return <div className="flex h-full min-h-0 flex-col bg-canvas-bg text-canvas-text">
    <header className="flex h-10 shrink-0 items-center gap-1 border-b border-canvas-border bg-canvas-surface px-2">
      {isMobile && <button className="rounded p-1.5 hover:bg-canvas-border" onClick={() => setSidebarOpen(true)}><Menu size={16} /></button>}
      <select value={currentAgentId || ''} onChange={(event) => setCurrentAgent(event.target.value)} className="max-w-48 rounded border border-canvas-border bg-canvas-bg px-2 py-1 text-xs"><option value="" disabled>Agent</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select>
      <button className="rounded p-1.5 hover:bg-canvas-border" onClick={() => void newTerminal()} title="New terminal"><TerminalIcon size={15} /></button>
      <button className="rounded p-1.5 hover:bg-canvas-border" onClick={() => void addResource('filebrowser')} title="Open files"><FolderOpen size={15} /></button>
      <button className="rounded p-1.5 hover:bg-canvas-border" onClick={() => void addResource('notes')} title="New note"><StickyNote size={15} /></button>
      <button className="rounded p-1.5 hover:bg-canvas-border" onClick={() => void addResource('tunnels')} title="Open tunnels"><Cable size={15} /></button>
      <span className="flex-1" />
      <button disabled={tabs.filter((id) => entryMap.has(id)).length < 2} className="rounded p-1.5 hover:bg-canvas-border disabled:opacity-30" onClick={() => createGroup(tabs.filter((id) => entryMap.has(id)))} title="Group open tabs"><Columns2 size={15} /></button>
      <button className="rounded p-1.5 hover:bg-canvas-border" onClick={() => setKeyboardVisible(!keyboardVisible)} title="Touch keyboard"><Keyboard size={15} /></button>
      {management.connections && <button className="rounded p-1.5 hover:bg-canvas-border" onClick={() => setConnectionsOpen(true)} title="Connections"><Settings2 size={15} /></button>}
      <button className="rounded p-1.5 hover:bg-canvas-border" onClick={() => setSettingsOpen(true)} title="Settings"><Wrench size={15} /></button>
    </header>
    <div className="relative flex min-h-0 flex-1">
      {sidebarOpen && sidebar}
      {isMobile && sidebarOpen && <button className="fixed inset-0 top-10 z-40 bg-black/50" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar" />}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 overflow-x-auto border-b border-canvas-border bg-canvas-surface">
          {tabs.map((id) => {
            const entry = entryMap.get(id); const group = groupMap.get(id); const title = entry ? entryTitle(entry) : group?.name || id;
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
          </> : <div className="flex flex-1 items-center justify-center text-sm text-canvas-muted"><div className="text-center"><TerminalIcon size={30} className="mx-auto mb-3 opacity-40" /><div>Select a session from the workspace tree.</div><button className="mt-3 rounded border border-canvas-border px-3 py-1.5 text-xs hover:bg-canvas-border" onClick={() => void newTerminal()}><Plus size={12} className="mr-1 inline" />New terminal</button></div></div>}
        </div>
      </main>
    </div>
    {management.connections && <ConnectionSettingsModal open={connectionsOpen} onClose={() => setConnectionsOpen(false)} />}
    <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    <ConfirmDialog open={!!deleteEntry} title={deleteEntry?.kind === 'session' ? `Kill "${deleteEntry.session.name}"?` : `Delete "${deleteEntry?.item.label}"?`} message={deleteEntry?.kind === 'session' ? 'This terminates the live PTY session.' : 'This removes the workspace resource.'} confirmLabel={deleteEntry?.kind === 'session' ? 'Kill' : 'Delete'} confirmTone="danger" onConfirm={() => void confirmDelete()} onClose={() => setDeleteEntry(null)} />
  </div>;
}
