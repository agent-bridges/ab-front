import { Star } from 'lucide-react';
import type { FavouriteSession } from '../stores/favouritesStore';
import { daemonDisplayName, sessionDisplayName } from '../stores/clientAliasStore';
import type { WorkspaceEntry } from './DesktopEntryPane';
import { WorkspaceEntryIcon } from './DesktopEntryPane';

export function FavouritesPanel({
  favourites,
  loading,
  failedAgents = 0,
  compact = false,
  onOpen,
  onRemove,
}: {
  favourites: FavouriteSession[];
  loading: boolean;
  failedAgents?: number;
  compact?: boolean;
  onOpen: (item: FavouriteSession) => void;
  onRemove: (item: FavouriteSession) => void;
}) {
  if (compact) {
    return (
      <section className="h-full overflow-y-auto py-1" aria-label="Fav">
        {failedAgents > 0 && <div className="mx-2 mb-1 rounded border border-amber-400/30 bg-amber-400/5 px-2 py-1.5 text-[10px] text-amber-300">Could not read {failedAgents} {failedAgents === 1 ? 'daemon' : 'daemons'}.</div>}
        {favourites.length === 0
          ? <div className="px-3 py-3 text-[11px] text-canvas-muted">{loading ? 'Loading…' : failedAgents > 0 ? 'Favourite data is unavailable' : 'No favourite terminals'}</div>
          : favourites.map((item) => {
            const entry: WorkspaceEntry = { key: `session:${item.session.id}`, kind: 'session', agentId: item.agent.id, session: item.session };
            return <div key={`${item.agent.id}:${item.session.id}`} className="group flex min-h-7 items-center gap-2 px-3 text-xs hover:bg-canvas-border">
              <button className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left" onClick={() => onOpen(item)} title={`${sessionDisplayName(item.session)} — ${daemonDisplayName(item.agent)}`}>
                <WorkspaceEntryIcon entry={entry} />
                <span className="min-w-0 flex-1 truncate">{sessionDisplayName(item.session)}</span>
                <span className="max-w-20 truncate text-[9px] text-canvas-muted">{daemonDisplayName(item.agent)}</span>
              </button>
              <button className="rounded p-0.5 text-yellow-400 hover:bg-yellow-400/10" onClick={() => onRemove(item)} title="Remove from Fav" aria-label={`Remove ${sessionDisplayName(item.session)} from Fav`}><Star size={10} className="fill-current" /></button>
            </div>;
          })}
      </section>
    );
  }

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
