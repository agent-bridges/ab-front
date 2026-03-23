import type { PtySession } from '../types';
import { createPtyStateWebSocket, startPing } from './wsUtils';

type OnSessionsCallback = (sessions: PtySession[]) => void;
type OnConnectedCallback = (connected: boolean) => void;

/**
 * WebSocket connection for receiving PTY session state updates for an agent.
 */
export class PtyStateConnection {
  private ws: WebSocket | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private agentId: string;
  private seq = 0;

  private onSessions: OnSessionsCallback | null = null;
  private onConnected: OnConnectedCallback | null = null;

  constructor(agentId: string) {
    this.agentId = agentId;
  }

  setOnSessions(cb: OnSessionsCallback) { this.onSessions = cb; }
  setOnConnected(cb: OnConnectedCallback) { this.onConnected = cb; }

  connect() {
    this.close();
    const seq = ++this.seq;

    const ws = createPtyStateWebSocket(this.agentId);
    this.ws = ws;

    const isCurrent = () => this.ws === ws && this.seq === seq;

    ws.onopen = () => {
      if (!isCurrent()) return;
      this.onConnected?.(true);
    };

    ws.onmessage = (event) => {
      if (!isCurrent()) return;
      const msg = JSON.parse(event.data);
      if (msg.type === 'pty_state') {
        this.onSessions?.(msg.sessions);
      }
    };

    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      if (!isCurrent()) return;
      this.onConnected?.(false);
      setTimeout(() => {
        if (this.seq === seq) this.connect();
      }, 2000);
    };

    ws.onerror = () => {
      if (!isCurrent()) return;
    };

    this.clearPing();
    this.pingInterval = startPing(() => this.ws);
  }

  private clearPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  close() {
    this.seq++;
    this.ws?.close();
    this.ws = null;
    this.clearPing();
  }

  destroy() {
    this.close();
    this.onSessions = null;
    this.onConnected = null;
  }
}
