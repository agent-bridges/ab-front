import { describe, expect, it } from 'vitest';
import type { Agent, PtySession } from '../types';
import { collectFavouriteSessions } from './favouritesStore';

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
});
