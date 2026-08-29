import { create } from 'zustand';
import type { Agent, Relay } from '../types';
import { fetchRelays } from '../api/relays';
import { flattenRelayMachines, relayCanConnect } from '../utils/agentDisplay';

interface AgentState {
  agents: Agent[];
  relays: Relay[];
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
  currentAgentId: null,
  boardRefreshToken: 0,
  loading: false,
  discoveryError: null,

  reset: () => set({
    agents: [],
    relays: [],
    currentAgentId: null,
    loading: false,
    discoveryError: null,
  }),
  setCurrentAgent: (id) => set({ currentAgentId: id }),
  refreshCurrentAgentBoard: () => set((state) => ({ boardRefreshToken: state.boardRefreshToken + 1 })),

  loadRelays: async (preferredAgentId) => {
    set({ loading: true, discoveryError: null });
    try {
      const relays = await fetchRelays();
      const agents = flattenRelayMachines(relays);
      const connectableIds = new Set(relays
        .filter(relayCanConnect)
        .flatMap((relay) => relay.machines.filter((machine) => machine.online).map((machine) => machine.id)));
      const state = get();
      const preferredExists =
        preferredAgentId && connectableIds.has(preferredAgentId)
          ? preferredAgentId
          : null;
      const nextCurrentAgentId =
        preferredExists ||
        (state.currentAgentId && connectableIds.has(state.currentAgentId)
          ? state.currentAgentId
          : null) ||
        agents.find((agent) => connectableIds.has(agent.id))?.id || null;
      set({
        agents,
        relays,
        loading: false,
        currentAgentId: nextCurrentAgentId,
        discoveryError: null,
      });
    } catch (e) {
      console.error('Failed to discover relays:', e);
      set({
        agents: [],
        relays: [],
        currentAgentId: null,
        loading: false,
        discoveryError: e instanceof Error ? e.message : 'Relay discovery failed',
      });
    }
  },
}));
