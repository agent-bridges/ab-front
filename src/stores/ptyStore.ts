import { create } from 'zustand';
import type { PtySession } from '../types';

interface PtyState {
  sessions: PtySession[];
  connected: boolean;
  setSessions: (sessions: PtySession[]) => void;
  setConnected: (connected: boolean) => void;
}

export const usePtyStore = create<PtyState>((set) => ({
  sessions: [],
  connected: false,
  setSessions: (sessions) => set({ sessions }),
  setConnected: (connected) => set({ connected }),
}));
