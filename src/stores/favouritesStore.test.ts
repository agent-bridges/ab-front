import { describe, expect, it } from 'vitest';
import type { Agent, PtySession } from '../types';
import { collectFavouriteSessions, mergeFavouriteMetadata, useFavouritesStore } from './favouritesStore';

const agent = (id: string): Agent => ({ id, name: id, relay_id: 'relay', relay_name: 'Relay', fingerprint: id, online: true });
const session = (id: string, fav: boolean, createdAt: string): PtySession => ({
  id,
  name: id,
  project_path: '/tmp',
  created_at: createdAt,
  clients: 0,
  alive: true,
  type: 'bash',
  locked: false,
  meta: { fav },
});

describe('collectFavouriteSessions', () => {
  it('collects daemon-owned favourites across agents and sorts newest first', () => {
    const first = agent('first');
    const second = agent('second');
    const result = collectFavouriteSessions([first, second], {
      first: {
        old: session('old', true, '2026-01-01T00:00:00Z'),
        ignored: session('ignored', false, '2026-03-01T00:00:00Z'),
      },
      second: { newest: session('newest', true, '2026-02-01T00:00:00Z') },
    });

    expect(result.map((item) => `${item.agent.id}/${item.session.id}`)).toEqual(['second/newest', 'first/old']);
  });

  it('keeps live activity while refreshing daemon-owned favourite metadata', () => {
    const rest = session('one', true, '2026-01-01T00:00:00Z');
    const merged = mergeFavouriteMetadata([rest], {
      one: { ...rest, processes: [{ pid: 42, cmd: 'codex', args: '' }], ai_status: 'working' },
    });

    expect(merged.one.meta?.fav).toBe(true);
    expect(merged.one.processes?.[0]?.cmd).toBe('codex');
    expect(merged.one.ai_status).toBe('working');
  });

  it('merges and clears live activity independently for each favourite daemon', () => {
    const first = session('one', true, '2026-01-01T00:00:00Z');
    const second = session('two', true, '2026-01-02T00:00:00Z');
    useFavouritesStore.setState({
      sessionsByAgent: { first: { one: first }, second: { two: second } },
      loadingAgents: {},
      errorsByAgent: {},
    });

    useFavouritesStore.getState().mergeLiveAgent('first', [
      { ...first, processes: [{ pid: 42, cmd: 'codex', args: '' }], ai_status: 'working' },
    ]);
    expect(useFavouritesStore.getState().sessionsByAgent.first.one.ai_status).toBe('working');
    expect(useFavouritesStore.getState().sessionsByAgent.second.two.ai_status).toBeUndefined();

    useFavouritesStore.getState().clearLiveAgent('first');
    expect(useFavouritesStore.getState().sessionsByAgent.first.one.processes).toBeUndefined();
    expect(useFavouritesStore.getState().sessionsByAgent.first.one.meta?.fav).toBe(true);
  });
});
