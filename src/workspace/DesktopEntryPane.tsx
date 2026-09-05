import { Eye, Minus, Pencil, RotateCw, Trash2, X } from 'lucide-react';
import FileBrowserView from '../components/filebrowser/FileBrowserView';
import NotesEditor from '../components/notes/NotesEditor';
import { forceRefresh as forceTerminalRefresh } from '../components/terminal/TerminalCache';
import TerminalView from '../components/terminal/TerminalView';
import TunnelsView from '../components/tunnels/TunnelsView';
import { useNoteViewMode } from '../hooks/useNoteViewMode';
import type { BoardItem, PtySession } from '../types';
import { getTerminalStatusMeta, PROCESS_STATUS_THEME } from '../components/ProcessIndicator';
import ClaudeIcon from '../components/icons/ClaudeIcon';
import CodexIcon from '../components/icons/CodexIcon';
import { Cable, FolderOpen, StickyNote, Terminal as TerminalIcon } from 'lucide-react';
import { sessionDisplayName } from '../stores/clientAliasStore';

export type WorkspaceEntry =
  | { key: string; kind: 'session'; agentId: string; session: PtySession }
  | { key: string; kind: 'board'; agentId: string; item: BoardItem };

export const workspaceEntryTitle = (entry: WorkspaceEntry) => entry.kind === 'session' ? entry.session.name : entry.item.label;

export const workspaceEntryDisplayTitle = (entry: WorkspaceEntry) =>
  entry.kind === 'session' ? sessionDisplayName(entry.session) : entry.item.label;

export function WorkspaceEntryIcon({ entry, size = 13 }: { entry: WorkspaceEntry; size?: number }) {
  if (entry.kind === 'board') {
    const Icon = entry.item.type === 'notes' ? StickyNote : entry.item.type === 'filebrowser' ? FolderOpen : Cable;
    return <Icon size={size} className="shrink-0 text-canvas-accent" />;
  }
  const meta = getTerminalStatusMeta(entry.session.alive, entry.session.processes, entry.session.ai_status);
  return (
    <span className="relative shrink-0">
      {meta.aiAgent === 'claude'
        ? <ClaudeIcon size={size + 1} />
        : meta.aiAgent === 'codex'
          ? <CodexIcon size={size + 1} />
          : <TerminalIcon size={size} className="text-canvas-accent" />}
      <span className={`absolute -bottom-0.5 -right-1 h-1.5 w-1.5 rounded-full ${PROCESS_STATUS_THEME[meta.status].dotClass}`} />
    </span>
  );
}

export const DESKTOP_TERMINAL_PANE_ACTIONS = ['refresh', 'hide', 'delete'] as const;

export default function DesktopEntryPane({
  entry,
  active = false,
  onActivate,
  onHide,
  onDelete,
}: {
  entry: WorkspaceEntry;
  active?: boolean;
  onActivate?: () => void;
  onHide: () => void;
  onDelete: () => void;
}) {
  const title = workspaceEntryDisplayTitle(entry);
  // Board preferences historically used the raw canvas/board item id. Keep
  // that key stable instead of changing it to the Workspace `board:` key.
  const preferenceId = entry.kind === 'board' ? entry.item.id : entry.key;
  const { mode: noteMode, setMode: setNoteMode } = useNoteViewMode(preferenceId);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-canvas-bg" data-desktop-entry-pane={entry.key} onPointerDown={onActivate}>
      <div className={`flex h-7 shrink-0 items-center gap-1 border-b px-2 ${active ? 'border-canvas-accent/40 bg-canvas-accent/15' : 'border-canvas-border bg-canvas-surface'}`}>
        <WorkspaceEntryIcon entry={entry} />
        <span className={`min-w-0 flex-1 truncate text-[10px] ${active ? 'font-medium text-canvas-accent' : 'text-canvas-muted'}`} title={title}>
          {title}
        </span>
        {entry.kind === 'session' && (
          <button
            className="rounded p-1 text-canvas-muted hover:bg-canvas-border hover:text-canvas-accent"
            onClick={(event) => { event.stopPropagation(); forceTerminalRefresh(entry.session.id); }}
            onPointerDown={(event) => event.stopPropagation()}
            title="Force redraw"
            aria-label={`Refresh terminal ${entry.session.name}`}
            data-pane-action="refresh"
          >
            <RotateCw size={11} />
          </button>
        )}
        {entry.kind === 'board' && entry.item.type === 'tunnels' && (
          <button
            className="rounded p-1 text-canvas-muted hover:bg-canvas-border hover:text-canvas-accent"
            onClick={(event) => { event.stopPropagation(); window.dispatchEvent(new CustomEvent('ab-tunnels-refresh', { detail: { itemId: entry.item.id } })); }}
            onPointerDown={(event) => event.stopPropagation()}
            title="Refresh tunnels"
            aria-label={`Refresh tunnels ${entry.item.label}`}
            data-pane-action="refresh-tunnels"
          >
            <RotateCw size={11} />
          </button>
        )}
        {entry.kind === 'board' && entry.item.type === 'notes' && (
          <button
            className="rounded p-1 text-canvas-muted hover:bg-canvas-border hover:text-canvas-text"
            onClick={(event) => { event.stopPropagation(); setNoteMode(noteMode === 'edit' ? 'preview' : 'edit'); }}
            onPointerDown={(event) => event.stopPropagation()}
            title={noteMode === 'edit' ? 'Preview markdown' : 'Edit note'}
            data-pane-action="note-mode"
          >
            {noteMode === 'edit' ? <Eye size={11} /> : <Pencil size={11} />}
          </button>
        )}
        <button
          className="rounded p-1 text-canvas-muted hover:bg-canvas-border hover:text-canvas-text"
          onClick={(event) => { event.stopPropagation(); onHide(); }}
          onPointerDown={(event) => event.stopPropagation()}
          title="Hide window (keeps the session alive)"
          aria-label={`Hide ${title}`}
          data-pane-action="hide"
        >
          <Minus size={11} />
        </button>
        <button
          className="rounded p-1 text-canvas-muted hover:bg-red-500/20 hover:text-red-400"
          onClick={(event) => { event.stopPropagation(); onDelete(); }}
          onPointerDown={(event) => event.stopPropagation()}
          title={entry.kind === 'session' ? 'Kill instance' : 'Delete resource'}
          aria-label={`${entry.kind === 'session' ? 'Kill' : 'Delete'} ${title}`}
          data-pane-action="delete"
        >
          {entry.kind === 'session' ? <X size={11} /> : <Trash2 size={11} />}
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {entry.kind === 'session' && <TerminalView session={entry.session} agentId={entry.agentId} />}
        {entry.kind === 'board' && entry.item.type === 'filebrowser' && <FileBrowserView item={entry.item} />}
        {entry.kind === 'board' && entry.item.type === 'notes' && <NotesEditor item={entry.item} mode={noteMode} />}
        {entry.kind === 'board' && entry.item.type === 'tunnels' && <TunnelsView item={entry.item} />}
      </div>
    </div>
  );
}
