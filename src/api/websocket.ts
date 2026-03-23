import { createAgentWebSocket, startPing } from './wsUtils';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';
type OnDataCallback = (data: string) => void;
type OnReadyCallback = (info: { session_id: string; name: string; project_path: string }) => void;
type OnStatusCallback = (status: ConnectionStatus) => void;

/**
 * Per-terminal WebSocket connection to a PTY session.
 * Each terminal instance gets its own PtyConnection.
 */
export class PtyConnection {
  private ws: WebSocket | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private intentionalClose = false;
  private wasConnected = false;

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
    this.close();
    this.setStatus('connecting');
    this.wasConnected = false;

    const ws = createAgentWebSocket(this.agentId);
    this.ws = ws;

    ws.onopen = () => {
      this.wasConnected = true;
      ws.send(JSON.stringify({
        action: 'attach',
        pty_id: this.ptyId,
        rows,
        cols,
        request_scrollback: requestScrollback,
      }));
    };

    ws.onmessage = (event) => {
      if (!event.data) return;
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (msg.type === 'ready') {
        this.setStatus('connected');
        this.onReady?.(msg);
      } else if (msg.type === 'output') {
        this.onData?.(msg.data);
      } else if (msg.type === 'clear') {
        this.onClear?.();
      } else if (msg.type === 'session_ended') {
        this.setStatus('disconnected');
        this.onSessionEnded?.();
      } else if (msg.type === 'error') {
        console.error('WS error:', msg.message);
        if (msg.message?.includes('not found')) {
          this.intentionalClose = true;
          this.onSessionEnded?.();
        }
      }
    };

    ws.onclose = () => {
      this.setStatus('disconnected');
      this.clearPing();
      if (!this.intentionalClose && this.wasConnected) {
        setTimeout(() => this.attach(rows, cols, true), 2000);
      }
      this.intentionalClose = false;
    };

    ws.onerror = () => console.error('WebSocket error');

    this.clearPing();
    this.pingInterval = startPing(() => this.ws);
  }

  sendInput(data: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'input', data }));
    }
  }

  sendResize(rows: number, cols: number) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'resize', rows, cols }));
    }
  }

  private clearPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  close() {
    this.intentionalClose = true;
    this.ws?.close();
    this.ws = null;
    this.clearPing();
  }

  destroy() {
    this.close();
    this.onData = null;
    this.onReady = null;
    this.onStatus = null;
    this.onClear = null;
    this.onSessionEnded = null;
  }
}
