import { useEffect, useState } from 'react';
import { useAgentStore } from './stores/agentStore';
import { useWorkspaceStore } from './stores/workspaceStore';
import { usePtyStore } from './stores/ptyStore';
import { useAuthStore } from './stores/authStore';
import { PtyStateConnection } from './api/ptyState';
import { checkAuth } from './api/auth';
import Workspace from './workspace/Workspace';
import MobileWorkspace from './workspace/MobileWorkspace';
import { useIsMobile } from './hooks/useIsMobile';
import LoginPage from './components/auth/LoginPage';
import FloatingKeyboard from './components/keyboard/FloatingKeyboard';
import FloatingToolbar from './components/keyboard/FloatingToolbar';
import { useCapabilitiesStore } from './stores/capabilitiesStore';

function getAgentIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/agents\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getBoardPath(agentId: string | null): string {
  return agentId ? `/agents/${encodeURIComponent(agentId)}` : '/';
}

export default function App() {
  const loadRelays = useAgentStore((s) => s.loadRelays);
  const resetAgents = useAgentStore((s) => s.reset);
  const agents = useAgentStore((s) => s.agents);
  const currentAgentId = useAgentStore((s) => s.currentAgentId);
  const boardRefreshToken = useAgentStore((s) => s.boardRefreshToken);
  const setCurrentAgent = useAgentStore((s) => s.setCurrentAgent);
  const { checkInit } = useAuthStore();
  const loadCapabilities = useCapabilitiesStore((s) => s.load);
  const resetCapabilities = useCapabilitiesStore((s) => s.reset);
  const isMobile = useIsMobile();
  const [authChecked, setAuthChecked] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [routeAgentId, setRouteAgentId] = useState(() => getAgentIdFromPath(window.location.pathname));

  const loadItems = useWorkspaceStore((s) => s.load);

  useEffect(() => {
    let cancelled = false;

    const initAuth = async () => {
      checkInit();
      const status = await checkAuth();
      if (cancelled) return;

      if (status === 'unauthenticated') {
        resetAgents();
        resetCapabilities();
        await loadItems(null);
        setNeedsAuth(true);
        setAuthChecked(true);
        return;
      }

      const preferredAgentId = getAgentIdFromPath(window.location.pathname);
      resetAgents();
      await loadItems(null);
      await Promise.all([loadCapabilities(), loadRelays(preferredAgentId)]);
      if (cancelled) return;

      setNeedsAuth(false);
      setRouteAgentId(preferredAgentId);
      setAuthChecked(true);
    };

    void initAuth();
    return () => {
      cancelled = true;
    };
  }, [checkInit, loadCapabilities, loadItems, loadRelays, resetAgents, resetCapabilities]);

  useEffect(() => {
    const handlePopState = () => {
      const nextRouteAgentId = getAgentIdFromPath(window.location.pathname);
      setRouteAgentId(nextRouteAgentId);

      if (!nextRouteAgentId || !agents.some((agent) => agent.id === nextRouteAgentId)) {
        return;
      }

      setCurrentAgent(nextRouteAgentId);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [agents, setCurrentAgent]);

  useEffect(() => {
    if (!currentAgentId) return;
    const nextPath = getBoardPath(currentAgentId);
    if (window.location.pathname === nextPath) return;

    const historyMethod = routeAgentId ? 'pushState' : 'replaceState';
    window.history[historyMethod]({}, '', nextPath);
    setRouteAgentId(currentAgentId);
  }, [currentAgentId, routeAgentId]);

  useEffect(() => {
    if (needsAuth) return;
    loadItems(currentAgentId);
  }, [boardRefreshToken, currentAgentId, loadItems, needsAuth]);

  const replaceSessions = usePtyStore((s) => s.replaceSessions);
  const setPtyConnected = usePtyStore((s) => s.setConnected);
  const clearPty = usePtyStore((s) => s.clear);

  // PTY sessions remain the source of truth and are stored directly by id/name.
  useEffect(() => {
    if (!currentAgentId) { clearPty(); return; }
    clearPty();
    const conn = new PtyStateConnection(currentAgentId);
    conn.setOnSessions((sessions) => {
      replaceSessions(currentAgentId, sessions);
    });
    conn.setOnConnected(setPtyConnected);
    // Daemon broadcasts when board_items mutates (e.g. peer agent runs
    // `ab notes create`). Debounce a burst of CLI ops into one re-fetch.
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    conn.setOnBoardItemsChanged(() => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        loadItems(currentAgentId);
      }, 250);
    });
    conn.connect();

    return () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      conn.destroy();
    };
  }, [boardRefreshToken, clearPty, currentAgentId, loadItems, replaceSessions, setPtyConnected]);

  if (!authChecked) return null;
  if (needsAuth) {
    return (
      <LoginPage
        onLoggedIn={() => {
          const preferredAgentId = getAgentIdFromPath(window.location.pathname);
          resetAgents();
          resetCapabilities();
          void loadItems(null).then(() => Promise.all([loadCapabilities(), loadRelays(preferredAgentId)])).then(() => {
            setNeedsAuth(false);
            setAuthChecked(true);
            setRouteAgentId(preferredAgentId);
          });
        }}
      />
    );
  }

  return (
    <div className="h-full flex flex-col relative">
      {isMobile ? <MobileWorkspace /> : <Workspace />}
      <FloatingKeyboard />
      <FloatingToolbar />
    </div>
  );
}
