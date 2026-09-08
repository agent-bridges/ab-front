import { useEffect, useMemo } from 'react';
import { PtyStateConnection } from '../api/ptyState';
import { useFavouritesStore } from '../stores/favouritesStore';
import type { Agent } from '../types';

/**
 * Keep activity indicators live for every daemon represented in Fav.
 * The main application already owns the selected daemon's state socket, so
 * this hook only opens the missing, favourite-bearing daemon connections.
 */
export function useFavouriteLiveStatus(
  agents: Agent[],
  enabled: boolean,
  currentAgentId: string | null,
) {
  const sessionsByAgent = useFavouritesStore((state) => state.sessionsByAgent);
  const mergeLiveAgent = useFavouritesStore((state) => state.mergeLiveAgent);
  const clearLiveAgent = useFavouritesStore((state) => state.clearLiveAgent);

  const routeIds = useMemo(() => agents
    .filter((agent) => agent.online && agent.id !== currentAgentId)
    .filter((agent) => Object.values(sessionsByAgent[agent.id] || {}).some((session) => session.meta?.fav === true))
    .map((agent) => agent.id)
    .sort()
    .join('\n'), [agents, currentAgentId, sessionsByAgent]);

  useEffect(() => {
    if (!enabled || !routeIds) return;
    const connections = routeIds.split('\n').map((agentId) => {
      const connection = new PtyStateConnection(agentId);
      connection.setOnSessions((sessions) => mergeLiveAgent(agentId, sessions));
      connection.setOnConnected((connected) => {
        if (!connected) clearLiveAgent(agentId);
      });
      connection.connect();
      return connection;
    });

    return () => connections.forEach((connection) => connection.destroy());
  }, [clearLiveAgent, enabled, mergeLiveAgent, routeIds]);
}
