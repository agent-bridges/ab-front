import { create } from 'zustand';
import type { Agent } from '../types';
import { fetchAgents } from '../api/agents';

interface AgentState {
  agents: Agent[];
  currentAgentId: string | null;
  boardRefreshToken: number;
  loading: boolean;
  reset: () => void;
  setCurrentAgent: (id: string) => void;
  refreshCurrentAgentBoard: () => void;
  loadAgents: (preferredAgentId?: string | null) => Promise<void>;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  currentAgentId: null,
  boardRefreshToken: 0,
  loading: false,

  reset: () => set({
    agents: [],
    currentAgentId: null,
    loading: false,
  }),
  setCurrentAgent: (id) => set({ currentAgentId: id }),
  refreshCurrentAgentBoard: () => set((state) => ({ boardRefreshToken: state.boardRefreshToken + 1 })),

  loadAgents: async (preferredAgentId) => {
    set({ loading: true });
    try {
      const agents = await fetchAgents();
      const state = get();
      const preferredExists =
        preferredAgentId && agents.some((agent) => agent.id === preferredAgentId)
          ? preferredAgentId
          : null;
      const nextCurrentAgentId =
        preferredExists ||
        (state.currentAgentId && agents.some((agent) => agent.id === state.currentAgentId)
          ? state.currentAgentId
          : null) ||
        (agents.length > 0 ? agents[0].id : null);
      set({
        agents,
        loading: false,
        currentAgentId: nextCurrentAgentId,
      });
    } catch (e) {
      console.error('Failed to load agents:', e);
      set({ loading: false });
    }
  },
}));
