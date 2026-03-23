export function createAgentWebSocket(agentId: string): WebSocket {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return new WebSocket(`${protocol}//${location.host}/ws/agents/${agentId}`);
}

export function createPtyStateWebSocket(agentId: string): WebSocket {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return new WebSocket(`${protocol}//${location.host}/ws/agents/${agentId}/pty-state`);
}

export function startPing(wsRef: () => WebSocket | null): ReturnType<typeof setInterval> {
  return setInterval(() => {
    const ws = wsRef();
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, 30000);
}
