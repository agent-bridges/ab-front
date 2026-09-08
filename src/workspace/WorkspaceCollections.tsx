import { LayoutGrid, Star, Trash2 } from 'lucide-react';
import type { IdeGroup } from '../types';
import type { FavouriteSession } from '../stores/favouritesStore';
import { daemonDisplayName, sessionDisplayName } from '../stores/clientAliasStore';
import type { WorkspaceEntry } from './DesktopEntryPane';
import { WorkspaceEntryIcon } from './DesktopEntryPane';

export const LAYOUTS_PANE_ID = 'workspace:layouts';
export const FAV_PANE_ID = 'workspace:fav';

export function LayoutsPanel({
  groups,
  entryMap,
  onOpen,
  onDelete,
}: {
  groups: IdeGroup[];
  entryMap: Map<string, WorkspaceEntry>;
  onOpen: (group: IdeGroup) => void;
  onDelete: (group: IdeGroup) => void;
}) {
  return (
    <section className="h-full overflow-y-auto p-4" aria-label="Layouts">
      <div className="mb-4 flex items-center gap-2"><LayoutGrid size={17} className="text-canvas-accent" /><h1 className="text-sm font-semibold">Layouts</h1></div>
      {groups.length === 0 ? <div className="rounded-lg border border-dashed border-canvas-border p-6 text-center text-xs text-canvas-muted">No saved layouts</div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => {
          const members = group.members.flatMap((key) => { const entry = entryMap.get(key); return entry ? [entry] : []; });
          return <div key={group.id} className="group rounded-lg border border-canvas-border bg-canvas-surface p-3">
            <div className="flex items-center gap-2">
              <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onOpen(group)}>
                <LayoutGrid size={15} className="shrink-0 text-canvas-accent" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{group.name}</span>
                <span className="text-[10px] uppercase text-canvas-muted">{group.layout}</span>
              </button>
              <button className="rounded p-1 text-canvas-muted opacity-70 hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100" onClick={() => onDelete(group)} title={`Delete ${group.name}`} aria-label={`Delete layout ${group.name}`}><Trash2 size={13} /></button>
            </div>
            <button className="mt-3 flex w-full flex-wrap gap-2 text-left" onClick={() => onOpen(group)}>
              {members.length > 0 ? members.map((entry) => <span key={entry.key} className="inline-flex max-w-full items-center gap-1 rounded border border-canvas-border bg-canvas-bg px-2 py-1 text-[10px] text-canvas-muted"><WorkspaceEntryIcon entry={entry} size={10} /><span className="truncate">{entry.kind === 'session' ? sessionDisplayName(entry.session) : entry.item.label}</span></span>) : <span className="text-[10px] text-canvas-muted">No available entries</span>}
            </button>
          </div>;
        })}
      </div>}
    </section>
  );
}

export function FavouritesPanel({
  favourites,
  loading,
  failedAgents = 0,
  onOpen,
  onRemove,
}: {
  favourites: FavouriteSession[];
  loading: boolean;
  failedAgents?: number;
  onOpen: (item: FavouriteSession) => void;
  onRemove: (item: FavouriteSession) => void;
}) {
  return (
    <section className="h-full overflow-y-auto p-4" aria-label="Fav">
      <div className="mb-4 flex items-center gap-2"><Star size={17} className="fill-yellow-400 text-yellow-400" /><h1 className="text-sm font-semibold">Fav</h1></div>
      {failedAgents > 0 && <div className="mb-3 rounded border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-xs text-amber-300">Could not read {failedAgents} {failedAgents === 1 ? 'daemon' : 'daemons'}.</div>}
      {favourites.length === 0 ? <div className="rounded-lg border border-dashed border-canvas-border p-6 text-center text-xs text-canvas-muted">{loading ? 'Loading…' : failedAgents > 0 ? 'Favourite data is unavailable' : 'No favourite terminals'}</div> : <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {favourites.map((item) => {
          const entry: WorkspaceEntry = { key: `session:${item.session.id}`, kind: 'session', agentId: item.agent.id, session: item.session };
          return <div key={`${item.agent.id}:${item.session.id}`} className="flex min-w-0 items-center gap-2 rounded-lg border border-canvas-border bg-canvas-surface p-2">
            <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onOpen(item)}>
              <WorkspaceEntryIcon entry={entry} size={15} />
              <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{sessionDisplayName(item.session)}</span><span className="block truncate text-[10px] text-canvas-muted">{daemonDisplayName(item.agent)}</span></span>
            </button>
            <button className="rounded p-1.5 text-yellow-400 hover:bg-yellow-400/10" onClick={() => onRemove(item)} title="Remove from Fav" aria-label={`Remove ${sessionDisplayName(item.session)} from Fav`}><Star size={15} className="fill-current" /></button>
          </div>;
        })}
      </div>}
    </section>
  );
}
