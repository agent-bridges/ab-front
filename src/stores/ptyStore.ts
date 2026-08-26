import { create } from 'zustand';
import type { PtySession } from '../types';
import { renamePty } from '../api/pty';

interface PtyState {
  agentId: string | null;
  sessionsById: Record<string, PtySession>;
  sessionIdByName: Record<string, string>;
  connected: boolean;
  replaceSessions: (agentId: string, sessions: PtySession[]) => void;
  clear: () => void;
  setConnected: (connected: boolean) => void;
  renameSession: (agentId: string, sessionId: string, name: string) => Promise<void>;
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
  renameSession: async (agentId, sessionId, requestedName) => {
    const name = requestedName.trim();
    if (!name) throw new Error('Session name cannot be empty');
    const state = usePtyStore.getState();
    const session = state.sessionsById[sessionId];
    if (!session || state.agentId !== agentId) throw new Error('Session is no longer available');
    const collision = state.sessionIdByName[name];
    if (collision && collision !== sessionId) throw new Error(`Session name "${name}" is already in use`);
    const previousName = session.name;
    if (previousName === name) return;

    set((current) => {
      const names = { ...current.sessionIdByName };
      delete names[previousName];
      names[name] = sessionId;
      return {
        sessionsById: { ...current.sessionsById, [sessionId]: { ...session, name } },
        sessionIdByName: names,
      };
    });

    try {
      await renamePty(agentId, sessionId, name);
    } catch (error) {
      set((current) => {
        if (current.sessionsById[sessionId]?.name !== name) return current;
        const names = { ...current.sessionIdByName };
        delete names[name];
        names[previousName] = sessionId;
        return {
          sessionsById: { ...current.sessionsById, [sessionId]: { ...session, name: previousName } },
          sessionIdByName: names,
        };
      });
      throw error;
    }
  },
}));
