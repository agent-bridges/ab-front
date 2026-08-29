import { create } from 'zustand';
import type { Agent, Relay } from '../types';
import { fetchRelays } from '../api/relays';
import { flattenRelayMachines } from '../utils/agentDisplay';

interface AgentState {
  agents: Agent[];
  relays: Relay[];
  revision: number | null;
  currentAgentId: string | null;
  boardRefreshToken: number;
  loading: boolean;
  discoveryError: string | null;
  reset: () => void;
  setCurrentAgent: (id: string) => void;
  refreshCurrentAgentBoard: () => void;
  loadRelays: (preferredAgentId?: string | null) => Promise<void>;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  relays: [],
  revision: null,
  currentAgentId: null,
  boardRefreshToken: 0,
  loading: false,
  discoveryError: null,

  reset: () => set({
    agents: [],
    relays: [],
    revision: null,
    currentAgentId: null,
    loading: false,
    discoveryError: null,
  }),
  setCurrentAgent: (id) => set({ currentAgentId: id }),
  refreshCurrentAgentBoard: () => set((state) => ({ boardRefreshToken: state.boardRefreshToken + 1 })),

  loadRelays: async (preferredAgentId) => {
    set({ loading: true, discoveryError: null });
    try {
      const discovery = await fetchRelays();
      const { relays } = discovery;
      const agents = flattenRelayMachines(relays);
      const state = get();
      const routeIds = new Set(agents.map((agent) => agent.id));
      const preferredExists = preferredAgentId && routeIds.has(preferredAgentId)
        ? preferredAgentId
        : null;
      const nextCurrentAgentId =
        preferredExists ||
        (state.currentAgentId && routeIds.has(state.currentAgentId)
          ? state.currentAgentId
          : null);
      set({
        agents,
        relays,
        revision: discovery.revision,
        loading: false,
        currentAgentId: nextCurrentAgentId,
        discoveryError: null,
      });
    } catch (e) {
      console.error('Failed to discover relays:', e);
      set({
        agents: [],
        relays: [],
        revision: null,
        currentAgentId: null,
        loading: false,
        discoveryError: e instanceof Error ? e.message : 'Relay discovery failed',
      });
    }
  },
}));
