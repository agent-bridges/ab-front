export function createAgentWebSocket(agentId: string): WebSocket {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return new WebSocket(`${protocol}//${location.host}/ws/agents/${agentId}`);
}

export function createPtyStateWebSocket(agentId: string): WebSocket {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return new WebSocket(`${protocol}//${location.host}/ws/agents/${agentId}/pty-state`);
}

export const WS_PING_INTERVAL_MS = 30000;

export interface HeartbeatHandle {
  acknowledge(ws: WebSocket): void;
  stop(): void;
}

export type ForegroundRecoveryEvent =
  | { reason: 'visible'; hiddenForMs: number }
  | { reason: 'pageshow' | 'online' | 'focus' };

/**
 * Application-level heartbeat understood by both daemon websocket endpoints.
 * Any inbound message proves that the peer is alive; normally the daemon also
 * replies to {type: "ping"} with {type: "pong"}.
 */
export function startHeartbeat(
  wsRef: () => WebSocket | null,
  onStale: (ws: WebSocket) => void,
): HeartbeatHandle {
  let awaitingSocket: WebSocket | null = null;
  let pingSentAt = 0;

  const timer = setInterval(() => {
    // Mobile browsers suspend timers in the background. Do not interpret that
    // suspension as a dead peer; the foreground lifecycle replaces the socket.
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    const ws = wsRef();
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      awaitingSocket = null;
      pingSentAt = 0;
      return;
    }

    if (awaitingSocket === ws && Date.now() - pingSentAt >= WS_PING_INTERVAL_MS) {
      awaitingSocket = null;
      pingSentAt = 0;
      onStale(ws);
      return;
    }

    try {
      ws.send(JSON.stringify({ type: 'ping' }));
      awaitingSocket = ws;
      pingSentAt = Date.now();
    } catch {
      onStale(ws);
    }
  }, WS_PING_INTERVAL_MS);

  return {
    acknowledge(ws) {
      if (awaitingSocket !== ws) return;
      awaitingSocket = null;
      pingSentAt = 0;
    },
    stop() {
      clearInterval(timer);
      awaitingSocket = null;
      pingSentAt = 0;
    },
  };
}

/** Register page/app lifecycle signals which commonly invalidate mobile WS. */
export function bindForegroundRecovery(
  onRecover: (event: ForegroundRecoveryEvent) => void,
): () => void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => {};

  let wasHidden = document.visibilityState === 'hidden';
  let hiddenAt = wasHidden ? Date.now() : 0;
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      wasHidden = true;
      hiddenAt = Date.now();
      return;
    }
    if (wasHidden) onRecover({ reason: 'visible', hiddenForMs: Date.now() - hiddenAt });
    wasHidden = false;
    hiddenAt = 0;
  };
  const onPageShow = () => onRecover({ reason: 'pageshow' });
  const onOnline = () => onRecover({ reason: 'online' });
  const onFocus = () => onRecover({ reason: 'focus' });

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('online', onOnline);
  window.addEventListener('focus', onFocus);

  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('focus', onFocus);
  };
}
