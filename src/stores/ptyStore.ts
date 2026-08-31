import { create } from 'zustand';
import type { PtySession } from '../types';

interface PtyState {
  agentId: string | null;
  sessionsById: Record<string, PtySession>;
  sessionIdByName: Record<string, string>;
  connected: boolean;
  replaceSessions: (agentId: string, sessions: PtySession[]) => void;
  clear: () => void;
  setConnected: (connected: boolean) => void;
}

export const usePtyStore = create<PtyState>((set) => ({
  agentId: null,
  sessionsById: {},
  sessionIdByName: {},
  connected: false,
  replaceSessions: (agentId, sessions) => set({
    agentId,
    sessionsById: Object.fromEntries(sessions.map((session) => [session.id, session])),
    sessionIdByName: Object.fromEntries(sessions.map((session) => [session.name, session.id])),
  }),
  clear: () => set({ agentId: null, sessionsById: {}, sessionIdByName: {}, connected: false }),
  setConnected: (connected) => set({ connected }),
}));
