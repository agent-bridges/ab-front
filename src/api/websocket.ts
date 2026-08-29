import {
  bindForegroundRecovery,
  createAgentWebSocket,
  startHeartbeat,
  type ForegroundRecoveryEvent,
  type HeartbeatHandle,
} from './wsUtils';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';
type OnDataCallback = (data: string) => void;
type OnReadyCallback = (info: { session_id: string; name: string; project_path: string }) => void;
type OnStatusCallback = (status: ConnectionStatus) => void;
const READY_TIMEOUT_MS = 12000;
const BACKGROUND_REPLACE_AFTER_MS = 2000;

/**
 * Per-terminal WebSocket connection to a PTY session.
 * Each terminal instance gets its own PtyConnection.
 */
export class PtyConnection {
  private ws: WebSocket | null = null;
  private heartbeat: HeartbeatHandle | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private desired = false;
  private destroyed = false;
  private retryAttempt = 0;
  private rows = 40;
  private cols = 120;
  private requestScrollback = false;
  private readyTimedOutWhileHidden = false;
  private socketStartedAt = 0;
  private lastForegroundRecoveryAt = Number.NEGATIVE_INFINITY;
  private removeLifecycleListeners: () => void;

  public agentId: string;
  public ptyId: string;
  public status: ConnectionStatus = 'disconnected';

  private onData: OnDataCallback | null = null;
  private onReady: OnReadyCallback | null = null;
  private onStatus: OnStatusCallback | null = null;
  private onClear: (() => void) | null = null;
  private onSessionEnded: (() => void) | null = null;

  constructor(agentId: string, ptyId: string) {
    this.agentId = agentId;
    this.ptyId = ptyId;
    this.removeLifecycleListeners = bindForegroundRecovery((event) => this.recoverFromForeground(event));
  }

  setOnData(cb: OnDataCallback) { this.onData = cb; }
  setOnReady(cb: OnReadyCallback) { this.onReady = cb; }
  setOnStatus(cb: OnStatusCallback) { this.onStatus = cb; }
  setOnClear(cb: () => void) { this.onClear = cb; }
  setOnSessionEnded(cb: () => void) { this.onSessionEnded = cb; }

  private setStatus(s: ConnectionStatus) {
    this.status = s;
    this.onStatus?.(s);
  }

  attach(rows = 40, cols = 120, requestScrollback = false) {
    if (this.destroyed) return;
    this.desired = true;
    this.rows = rows;
    this.cols = cols;
    this.requestScrollback = requestScrollback;
    this.retryAttempt = 0;
    this.openSocket(false);
  }

  private openSocket(recovering: boolean) {
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

    this.setStatus('connecting');

    const ws = createAgentWebSocket(this.agentId);
    this.ws = ws;
    this.socketStartedAt = Date.now();
    this.readyTimedOutWhileHidden = false;
    let recoveryNeedsClear = recovering || this.requestScrollback;
    const isCurrent = () => (
      this.desired && !this.destroyed && this.ws === ws && this.generation === generation
    );

    ws.onopen = () => {
      if (!isCurrent()) return;
      ws.send(JSON.stringify({
        action: 'attach',
        pty_id: this.ptyId,
        rows: this.rows,
        cols: this.cols,
        request_scrollback: recovering || this.requestScrollback,
      }));
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
      if (!event.data) return;
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (msg.type === 'pong') return;

      // A recovery snapshot is the complete daemon scrollback. Clear the
      // cached xterm once before applying it so reconnects do not duplicate
      // the whole terminal history.
      if (recoveryNeedsClear && (msg.type === 'output' || msg.type === 'ready')) {
        recoveryNeedsClear = false;
        this.onClear?.();
      }

      if (msg.type === 'ready') {
        this.clearReadyTimer();
        this.readyTimedOutWhileHidden = false;
        this.retryAttempt = 0;
        this.setStatus('connected');
        this.onReady?.(msg);
      } else if (msg.type === 'output') {
        this.onData?.(msg.data);
      } else if (msg.type === 'clear') {
        this.onClear?.();
      } else if (msg.type === 'session_ended') {
        this.stopCurrentSocket(ws);
        this.onSessionEnded?.();
      } else if (msg.type === 'error') {
        console.error('WS error:', msg.message);
        if (msg.message?.toLowerCase().includes('not found') || msg.message?.toLowerCase().includes('dead')) {
          this.stopCurrentSocket(ws);
          this.onSessionEnded?.();
        }
      }
    };

    ws.onclose = () => {
      if (!isCurrent()) return;
      this.ws = null;
      this.clearReadyTimer();
      this.stopHeartbeat();
      this.setStatus('disconnected');
      this.scheduleRetry(generation);
    };

    ws.onerror = () => {
      if (!isCurrent()) return;
      console.error('WebSocket error');
      // Some mobile engines delay (or omit) close after a failed handshake.
      // Detach now so pre-ready failures enter the same bounded retry path.
      this.failCurrentSocket(ws, generation);
    };

    this.heartbeat = startHeartbeat(
      () => (isCurrent() ? this.ws : null),
      (staleSocket) => {
        if (!isCurrent() || staleSocket !== ws) return;
        this.openSocket(true);
      },
    );
  }

  sendInput(data: string) {
    if (!this.desired || this.destroyed) return;
    if (this.status === 'connected' && this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'input', data }));
        return;
      } catch {
        this.openSocket(true);
        return;
      }
    }
    // Never replay terminal input later: delayed Enter/Ctrl-C/password bytes
    // can be dangerous in a different prompt. The next keystroke after ready
    // is delivered normally.
    this.recoverNow();
  }

  sendResize(rows: number, cols: number) {
    this.rows = rows;
    this.cols = cols;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'resize', rows, cols }));
    } else if (this.desired) {
      this.recoverNow();
    }
  }

  private scheduleRetry(generation: number) {
    if (!this.desired || this.destroyed || this.retryTimer) return;
    const delay = Math.min(1000 * (2 ** this.retryAttempt), 10000);
    this.retryAttempt = Math.min(this.retryAttempt + 1, 4);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.desired || this.destroyed || this.generation !== generation) return;
      this.openSocket(true);
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

  private stopCurrentSocket(ws: WebSocket) {
    if (this.ws !== ws) return;
    this.desired = false;
    this.clearRetry();
    this.stopHeartbeat();
    this.clearReadyTimer();
    this.ws = null;
    this.generation++;
    try { ws.close(); } catch {}
    this.setStatus('disconnected');
  }

  private failCurrentSocket(ws: WebSocket, generation: number) {
    if (this.ws !== ws || this.generation !== generation) return;
    this.ws = null;
    this.clearReadyTimer();
    this.stopHeartbeat();
    this.setStatus('disconnected');
    try { ws.close(); } catch {}
    this.scheduleRetry(generation);
  }

  private recoverNow() {
    if (!this.desired || this.destroyed) return;
    if (this.status === 'connecting' && this.ws) return;
    this.openSocket(true);
  }

  private recoverFromForeground(event: ForegroundRecoveryEvent) {
    if (!this.desired || this.destroyed) return;
    const healthy = this.status === 'connected' && this.ws?.readyState === WebSocket.OPEN;
    const connectingIsFresh = (
      this.status === 'connecting'
      && this.ws != null
      && !this.readyTimedOutWhileHidden
      && Date.now() - this.socketStartedAt < READY_TIMEOUT_MS
    );

    // A normal focus event must not reconnect every healthy cached terminal.
    if (event.reason === 'focus' && (healthy || connectingIsFresh)) return;
    if (event.reason === 'visible' && healthy && event.hiddenForMs < BACKGROUND_REPLACE_AFTER_MS) return;
    if (connectingIsFresh) return;

    const now = Date.now();
    if (this.ws && now - this.lastForegroundRecoveryAt < 1000) return;
    this.lastForegroundRecoveryAt = now;
    this.openSocket(true);
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
    this.setStatus('disconnected');
  }

  destroy() {
    if (this.destroyed) return;
    this.close();
    this.destroyed = true;
    this.removeLifecycleListeners();
    this.onData = null;
    this.onReady = null;
    this.onStatus = null;
    this.onClear = null;
    this.onSessionEnded = null;
  }
}
