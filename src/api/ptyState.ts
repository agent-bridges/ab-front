import type { PtySession } from '../types';
import {
  bindForegroundRecovery,
  createPtyStateWebSocket,
  startHeartbeat,
  type ForegroundRecoveryEvent,
  type HeartbeatHandle,
} from './wsUtils';

const READY_TIMEOUT_MS = 12000;
const BACKGROUND_REPLACE_AFTER_MS = 2000;

type OnSessionsCallback = (sessions: PtySession[]) => void;
type OnConnectedCallback = (connected: boolean) => void;
type OnBoardItemsChangedCallback = () => void;

/**
 * WebSocket connection for receiving PTY session state updates for an agent.
 */
export class PtyStateConnection {
  private ws: WebSocket | null = null;
  private heartbeat: HeartbeatHandle | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;
  private agentId: string;
  private generation = 0;
  private desired = false;
  private destroyed = false;
  private retryAttempt = 0;
  private readyTimedOutWhileHidden = false;
  private socketStartedAt = 0;
  private lastForegroundRecoveryAt = Number.NEGATIVE_INFINITY;
  private removeLifecycleListeners: () => void;

  private onSessions: OnSessionsCallback | null = null;
  private onConnected: OnConnectedCallback | null = null;
  private onBoardItemsChanged: OnBoardItemsChangedCallback | null = null;

  constructor(agentId: string) {
    this.agentId = agentId;
    this.removeLifecycleListeners = bindForegroundRecovery((event) => this.recoverFromForeground(event));
  }

  setOnSessions(cb: OnSessionsCallback) { this.onSessions = cb; }
  setOnConnected(cb: OnConnectedCallback) { this.onConnected = cb; }
  setOnBoardItemsChanged(cb: OnBoardItemsChangedCallback) { this.onBoardItemsChanged = cb; }

  connect() {
    if (this.destroyed) return;
    this.desired = true;
    this.retryAttempt = 0;
    this.openSocket();
  }

  private openSocket() {
    if (!this.desired || this.destroyed) return;
    this.clearRetry();

    const oldSocket = this.ws;
    const generation = ++this.generation;
    this.ws = null;
    this.clearReadyTimer();
    this.stopHeartbeat();
    if (oldSocket) {
      try { oldSocket.close(); } catch {}
    }

    const ws = createPtyStateWebSocket(this.agentId);
    this.ws = ws;
    this.socketStartedAt = Date.now();
    this.readyTimedOutWhileHidden = false;

    const isCurrent = () => (
      this.desired && !this.destroyed && this.ws === ws && this.generation === generation
    );

    ws.onopen = () => {
      if (!isCurrent()) return;
      this.clearReadyTimer();
      this.retryAttempt = 0;
      this.onConnected?.(true);
    };

    this.readyTimer = setTimeout(() => {
      if (!isCurrent()) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        this.readyTimedOutWhileHidden = true;
        return;
      }
      this.failCurrentSocket(ws, generation);
    }, READY_TIMEOUT_MS);

    ws.onmessage = (event) => {
      if (!isCurrent()) return;
      this.heartbeat?.acknowledge(ws);
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.type === 'pong') return;
      if (msg.type === 'pty_state') {
        this.onSessions?.(msg.sessions);
      } else if (msg.type === 'board_items_changed') {
        this.onBoardItemsChanged?.();
      }
    };

    ws.onclose = () => {
      if (!isCurrent()) return;
      this.ws = null;
      this.clearReadyTimer();
      this.stopHeartbeat();
      this.onConnected?.(false);
      this.scheduleRetry(generation);
    };

    ws.onerror = () => {
      if (!isCurrent()) return;
      this.failCurrentSocket(ws, generation);
    };

    this.heartbeat = startHeartbeat(
      () => (isCurrent() ? this.ws : null),
      (staleSocket) => {
        if (!isCurrent() || staleSocket !== ws) return;
        this.openSocket();
      },
    );
  }

  private scheduleRetry(generation: number) {
    if (!this.desired || this.destroyed || this.retryTimer) return;
    const delay = Math.min(1000 * (2 ** this.retryAttempt), 10000);
    this.retryAttempt = Math.min(this.retryAttempt + 1, 4);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.desired || this.destroyed || this.generation !== generation) return;
      this.openSocket();
    }, delay);
  }

  private clearRetry() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private clearReadyTimer() {
    if (this.readyTimer) {
      clearTimeout(this.readyTimer);
      this.readyTimer = null;
    }
  }

  private stopHeartbeat() {
    this.heartbeat?.stop();
    this.heartbeat = null;
  }

  private failCurrentSocket(ws: WebSocket, generation: number) {
    if (this.ws !== ws || this.generation !== generation) return;
    this.ws = null;
    this.clearReadyTimer();
    this.stopHeartbeat();
    this.onConnected?.(false);
    try { ws.close(); } catch {}
    this.scheduleRetry(generation);
  }

  private recoverFromForeground(event: ForegroundRecoveryEvent) {
    if (!this.desired || this.destroyed) return;
    const healthy = this.ws?.readyState === WebSocket.OPEN;
    const connectingIsFresh = (
      this.ws?.readyState === WebSocket.CONNECTING
      && !this.readyTimedOutWhileHidden
      && Date.now() - this.socketStartedAt < READY_TIMEOUT_MS
    );
    if (event.reason === 'focus' && (healthy || connectingIsFresh)) return;
    if (event.reason === 'visible' && healthy && event.hiddenForMs < BACKGROUND_REPLACE_AFTER_MS) return;
    if (connectingIsFresh) return;

    const now = Date.now();
    if (this.ws && now - this.lastForegroundRecoveryAt < 1000) return;
    this.lastForegroundRecoveryAt = now;
    this.openSocket();
  }

  close() {
    this.desired = false;
    this.clearRetry();
    this.clearReadyTimer();
    this.stopHeartbeat();
    const ws = this.ws;
    this.ws = null;
    this.generation++;
    if (ws) {
      try { ws.close(); } catch {}
    }
    this.onConnected?.(false);
  }

  destroy() {
    if (this.destroyed) return;
    this.close();
    this.destroyed = true;
    this.removeLifecycleListeners();
    this.onSessions = null;
    this.onConnected = null;
    this.onBoardItemsChanged = null;
  }
}
