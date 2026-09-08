import { create } from 'zustand';
import { listPtySessions, setPtyFavourite } from '../api/pty';
import type { Agent, PtySession } from '../types';

type SessionsByAgent = Record<string, Record<string, PtySession>>;

interface FavouritesState {
  sessionsByAgent: SessionsByAgent;
  loadingAgents: Record<string, boolean>;
  errorsByAgent: Record<string, string>;
  refreshAgent: (agentId: string) => Promise<void>;
  refreshAgents: (agents: Agent[]) => Promise<void>;
  mergeLiveAgent: (agentId: string, sessions: PtySession[]) => void;
  clearLiveAgent: (agentId: string) => void;
  setFavourite: (agentId: string, session: PtySession, fav: boolean) => Promise<void>;
}

export interface FavouriteSession {
  agent: Agent;
  session: PtySession;
  /** Every configured relay route that reaches this physical daemon/session. */
  routes: Agent[];
}

export function collectFavouriteSessions(agents: Agent[], sessionsByAgent: SessionsByAgent): FavouriteSession[] {
  const grouped = new Map<string, FavouriteSession>();
  for (const agent of agents) {
    for (const session of Object.values(sessionsByAgent[agent.id] || {})) {
      if (session.meta?.fav !== true) continue;
      const key = `${agent.fingerprint}\0${session.id}`;
      const current = grouped.get(key);
      if (!current) {
        grouped.set(key, { agent, session, routes: [agent] });
        continue;
      }
      current.routes.push(agent);
      const currentIsLive = current.session.processes !== undefined;
      const candidateIsLive = session.processes !== undefined;
      if ((!current.agent.online && agent.online) || (!currentIsLive && candidateIsLive)) {
        current.agent = agent;
        current.session = session;
      }
    }
  }
  return [...grouped.values()]
    .map((item) => ({
      ...item,
      routes: item.routes.sort((a, b) => a.relay_name.localeCompare(b.relay_name)),
    }))
    .sort((a, b) => (b.session.created_at || '').localeCompare(a.session.created_at || ''));
}

export function mergeFavouriteMetadata(
  sessions: PtySession[],
  previous: Record<string, PtySession> = {},
): Record<string, PtySession> {
  return Object.fromEntries(sessions.map((session) => {
    const cached = previous[session.id];
    const live = cached?.processes === undefined
      ? {}
      : { processes: cached.processes, ai_status: cached.ai_status };
    return [session.id, { ...cached, ...session, ...live, meta: session.meta }];
  }));
}

export const useFavouritesStore = create<FavouritesState>((set, get) => ({
  sessionsByAgent: {},
  loadingAgents: {},
  errorsByAgent: {},
  refreshAgent: async (agentId) => {
    set((state) => ({
      loadingAgents: { ...state.loadingAgents, [agentId]: true },
      errorsByAgent: { ...state.errorsByAgent, [agentId]: '' },
    }));
    try {
      const sessions = await listPtySessions(agentId);
      set((state) => ({
        sessionsByAgent: {
          ...state.sessionsByAgent,
          [agentId]: mergeFavouriteMetadata(sessions, state.sessionsByAgent[agentId]),
        },
        loadingAgents: { ...state.loadingAgents, [agentId]: false },
      }));
    } catch (error) {
      set((state) => ({
        loadingAgents: { ...state.loadingAgents, [agentId]: false },
        errorsByAgent: { ...state.errorsByAgent, [agentId]: error instanceof Error ? error.message : String(error) },
      }));
    }
  },
  refreshAgents: async (agents) => {
    await Promise.allSettled(agents.filter((agent) => agent.online).map((agent) => get().refreshAgent(agent.id)));
  },
  mergeLiveAgent: (agentId, sessions) => set((state) => {
    const previous = state.sessionsByAgent[agentId] || {};
    const next = { ...previous };
    for (const session of sessions) {
      next[session.id] = {
        ...previous[session.id],
        ...session,
        meta: previous[session.id]?.meta,
      };
    }
    return { sessionsByAgent: { ...state.sessionsByAgent, [agentId]: next } };
  }),
  clearLiveAgent: (agentId) => set((state) => {
    const previous = state.sessionsByAgent[agentId];
    if (!previous) return state;
    return {
      sessionsByAgent: {
        ...state.sessionsByAgent,
        [agentId]: Object.fromEntries(Object.entries(previous).map(([id, session]) => {
          const { processes: _processes, ai_status: _aiStatus, ...rest } = session;
          return [id, rest as PtySession];
        })),
      },
    };
  }),
  setFavourite: async (agentId, session, fav) => {
    const before = get().sessionsByAgent[agentId]?.[session.id];
    const optimistic = { ...(before || session), meta: { ...(before?.meta || session.meta || {}), fav } };
    set((state) => ({
      sessionsByAgent: {
        ...state.sessionsByAgent,
        [agentId]: { ...(state.sessionsByAgent[agentId] || {}), [session.id]: optimistic },
      },
    }));
    try {
      const response = await setPtyFavourite(agentId, session.id, fav);
      set((state) => ({
        sessionsByAgent: {
          ...state.sessionsByAgent,
          [agentId]: {
            ...(state.sessionsByAgent[agentId] || {}),
            [session.id]: { ...optimistic, meta: { ...optimistic.meta, ...response.meta, fav } },
          },
        },
      }));
    } catch (error) {
      set((state) => {
        const currentAgent = { ...(state.sessionsByAgent[agentId] || {}) };
        if (before) currentAgent[session.id] = before;
        else delete currentAgent[session.id];
        return { sessionsByAgent: { ...state.sessionsByAgent, [agentId]: currentAgent } };
      });
      throw error;
    }
  },
}));
