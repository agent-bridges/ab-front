import { useEffect, useState } from 'react';
import { useAgentStore } from './stores/agentStore';
import { useCanvasStore } from './stores/canvasStore';
import { useAuthStore } from './stores/authStore';
import { useIsMobile } from './hooks/useIsMobile';
import { PtyStateConnection } from './api/ptyState';
import { checkAuth } from './api/auth';
import Toolbar from './components/Toolbar';
import Canvas from './canvas/Canvas';
import MobileWindows from './canvas/MobileWindows';
import LoginPage from './components/auth/LoginPage';
import FloatingKeyboard from './components/keyboard/FloatingKeyboard';
import FloatingToolbar from './components/keyboard/FloatingToolbar';

function getAgentIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/agents\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getBoardPath(agentId: string | null): string {
  return agentId ? `/agents/${encodeURIComponent(agentId)}` : '/';
}

export default function App() {
  const loadAgents = useAgentStore((s) => s.loadAgents);
  const resetAgents = useAgentStore((s) => s.reset);
  const agents = useAgentStore((s) => s.agents);
  const currentAgentId = useAgentStore((s) => s.currentAgentId);
  const boardRefreshToken = useAgentStore((s) => s.boardRefreshToken);
  const setCurrentAgent = useAgentStore((s) => s.setCurrentAgent);
  const isMobile = useIsMobile();
  const { checkInit } = useAuthStore();
  const [authChecked, setAuthChecked] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [routeAgentId, setRouteAgentId] = useState(() => getAgentIdFromPath(window.location.pathname));

  const loadItems = useCanvasStore((s) => s.loadItems);

  useEffect(() => {
    let cancelled = false;

    const initAuth = async () => {
      // mTLS gate: if Settings has "Require client cert" on, browsers must
      // be on :5444 (the cert-enforcing port). The check runs over :5443
      // (which is always open, the no-cert port), but we still get the
      // setting because /api works on :5443. If required and we're on :5443,
      // hard-redirect to :5444 with the same path/query/hash. :5443 stays
      // available as the recovery channel — toggling required back off from
      // there will let you back in if you ever lose the cert.
      try {
        if (window.location.port === '5443') {
          const r = await fetch('/api/auth/client-cert/status', { cache: 'no-store' });
          if (r.ok) {
            const s = await r.json();
            if (s.required) {
              const target = `${window.location.protocol}//${window.location.hostname}:5444${window.location.pathname}${window.location.search}${window.location.hash}`;
              window.location.replace(target);
              return; // browser is leaving; nothing more to do.
            }
          }
        }
      } catch { /* network failures fall through to the normal flow */ }

      checkInit();
      const status = await checkAuth();
      if (cancelled) return;

      if (status === 'unauthenticated') {
        resetAgents();
        await loadItems(null);
        setNeedsAuth(true);
        setAuthChecked(true);
        return;
      }

      const preferredAgentId = getAgentIdFromPath(window.location.pathname);
      resetAgents();
      await loadItems(null);
      await loadAgents(preferredAgentId);
      if (cancelled) return;

      setNeedsAuth(false);
      setRouteAgentId(preferredAgentId);
      setAuthChecked(true);
    };

    void initAuth();
    return () => {
      cancelled = true;
    };
  }, [checkInit, loadAgents, loadItems, resetAgents]);

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

  const syncTerminals = useCanvasStore((s) => s.syncTerminals);

  // PTY sessions -> canvas terminal items (sessions are source of truth)
  useEffect(() => {
    if (!currentAgentId) return;
    const conn = new PtyStateConnection(currentAgentId);
    conn.setOnSessions((sessions) => {
      syncTerminals(sessions, currentAgentId);
    });
    conn.connect();

    return () => conn.destroy();
  }, [boardRefreshToken, currentAgentId, syncTerminals]);

  if (!authChecked) return null;
  if (needsAuth) {
    return (
      <LoginPage
        onLoggedIn={() => {
          const preferredAgentId = getAgentIdFromPath(window.location.pathname);
          resetAgents();
          void loadItems(null).then(() => loadAgents(preferredAgentId)).then(() => {
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
      <Toolbar />
      <Canvas />
      {isMobile && <MobileWindows />}
      <FloatingKeyboard />
      <FloatingToolbar />
    </div>
  );
}
