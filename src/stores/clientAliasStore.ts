import { create } from 'zustand';
import type { Agent, PtySession } from '../types';

const STORAGE_KEY = 'ab:client-aliases:v1';

interface StoredAliases {
  daemons: Record<string, string>;
  sessions: Record<string, string>;
}

interface ClientAliasState extends StoredAliases {
  setDaemonAlias: (daemonId: string, alias: string) => void;
  setSessionAlias: (daemonId: string, sessionId: string, alias: string) => void;
}

export const sessionAliasKey = (daemonId: string, sessionId: string) =>
  JSON.stringify([daemonId, sessionId]);

function loadAliases(): StoredAliases {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<StoredAliases>;
    return {
      daemons: parsed.daemons && typeof parsed.daemons === 'object' ? parsed.daemons : {},
      sessions: parsed.sessions && typeof parsed.sessions === 'object' ? parsed.sessions : {},
    };
  } catch {
    return { daemons: {}, sessions: {} };
  }
}

function persist(aliases: StoredAliases) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(aliases));
}

const initial = loadAliases();

export const useClientAliasStore = create<ClientAliasState>((set) => ({
  ...initial,
  setDaemonAlias: (daemonId, requestedAlias) => set((state) => {
    const alias = requestedAlias.trim();
    const daemons = { ...state.daemons };
    if (alias) daemons[daemonId] = alias;
    else delete daemons[daemonId];
    persist({ daemons, sessions: state.sessions });
    return { daemons };
  }),
  setSessionAlias: (daemonId, sessionId, requestedAlias) => set((state) => {
    const alias = requestedAlias.trim();
    const key = sessionAliasKey(daemonId, sessionId);
    const sessions = { ...state.sessions };
    if (alias) sessions[key] = alias;
    else delete sessions[key];
    persist({ daemons: state.daemons, sessions });
    return { sessions };
  }),
}));

export function daemonDisplayName(agent: Agent, aliases: Record<string, string>): string {
  return aliases[agent.id]?.trim() || agent.name;
}

export function sessionDisplayName(
  daemonId: string,
  session: PtySession,
  aliases: Record<string, string>,
): string {
  return aliases[sessionAliasKey(daemonId, session.id)]?.trim() || session.name;
}
