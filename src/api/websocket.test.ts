import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PtyStateConnection } from './ptyState';
import { PtyConnection } from './websocket';

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event('open'));
  }

  message(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
  }

  failAndClose() {
    this.onerror?.(new Event('error'));
    this.emitClose();
  }

  emitClose() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new Event('close') as CloseEvent);
  }

  send(data: string) {
    if (this.readyState !== FakeWebSocket.OPEN) throw new Error('socket is not open');
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSING;
  }
}

class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible';
}

let fakeDocument: FakeDocument;
let fakeWindow: EventTarget;

function socket(index = FakeWebSocket.instances.length - 1) {
  return FakeWebSocket.instances[index];
}

function ready(ws: FakeWebSocket, name = 'shell') {
  ws.open();
  ws.message({ type: 'ready', session_id: 'pty-1', name, project_path: '/tmp' });
}

function sentMessages(ws: FakeWebSocket) {
  return ws.sent.map((entry) => JSON.parse(entry));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-29T00:00:00Z'));
  FakeWebSocket.instances = [];
  fakeDocument = new FakeDocument();
  fakeWindow = new EventTarget();
  vi.stubGlobal('document', fakeDocument);
  vi.stubGlobal('window', fakeWindow);
  vi.stubGlobal('location', { protocol: 'https:', host: 'ab.test' });
  vi.stubGlobal('WebSocket', FakeWebSocket);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PtyConnection lifecycle', () => {
  it('does not carry an intentional-close flag into a replacement attach', () => {
    const connection = new PtyConnection('7', 'pty-1');
    connection.attach(24, 80, true);
    const first = socket();
    connection.attach(30, 100, true);
    const second = socket();

    // The first socket may report its delayed close after the replacement.
    first.emitClose();
    second.failAndClose();
    vi.advanceTimersByTime(1000);

    expect(FakeWebSocket.instances).toHaveLength(3);
    connection.destroy();
  });

  it('reconnects after an unexpected close and restores the latest geometry', () => {
    const connection = new PtyConnection('7', 'pty-1');
    connection.attach(24, 80, true);
    const first = socket();
    ready(first);
    connection.sendResize(33, 111);
    first.emitClose();

    vi.advanceTimersByTime(1000);
    const second = socket();
    second.open();

    expect(sentMessages(second)[0]).toMatchObject({
      action: 'attach', rows: 33, cols: 111, request_scrollback: true,
    });
    connection.destroy();
  });

  it('retries a failure before the first successful open', () => {
    const connection = new PtyConnection('7', 'pty-1');
    connection.attach();
    const failed = socket();
    failed.onerror?.(new Event('error'));

    vi.advanceTimersByTime(999);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
    connection.destroy();
  });

  it('does not reconnect after an intentional close', () => {
    const connection = new PtyConnection('7', 'pty-1');
    connection.attach();
    const first = socket();
    ready(first);
    connection.close();
    first.emitClose();

    vi.advanceTimersByTime(60000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    connection.destroy();
  });

  it('ignores stale callbacks from a replaced socket', () => {
    const onData = vi.fn();
    const connection = new PtyConnection('7', 'pty-1');
    connection.setOnData(onData);
    connection.attach();
    const first = socket();
    connection.attach();
    const second = socket();

    first.message({ type: 'output', data: 'stale' });
    first.emitClose();
    vi.advanceTimersByTime(10000);

    expect(onData).not.toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(connection.status).toBe('connecting');
    expect(socket()).toBe(second);
    connection.destroy();
  });

  it('replaces an apparently-open socket when returning from background', () => {
    const onClear = vi.fn();
    const onData = vi.fn();
    const connection = new PtyConnection('7', 'pty-1');
    connection.setOnClear(onClear);
    connection.setOnData(onData);
    connection.attach(24, 80, true);
    ready(socket());

    fakeDocument.visibilityState = 'hidden';
    fakeDocument.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(2001);
    fakeDocument.visibilityState = 'visible';
    fakeDocument.dispatchEvent(new Event('visibilitychange'));

    expect(FakeWebSocket.instances).toHaveLength(2);
    const resumed = socket();
    resumed.open();
    resumed.message({ type: 'output', data: 'snapshot' });
    resumed.message({ type: 'ready', session_id: 'pty-1', name: 'shell', project_path: '/tmp' });
    expect(onClear).toHaveBeenCalledTimes(2);
    expect(onData).toHaveBeenCalledWith('snapshot');
    connection.destroy();
  });

  it('clears exactly once before a full snapshot on a second explicit attach', () => {
    const onClear = vi.fn();
    const onData = vi.fn();
    const connection = new PtyConnection('7', 'pty-1');
    connection.setOnClear(onClear);
    connection.setOnData(onData);
    connection.attach(24, 80, true);
    const first = socket();
    first.open();
    first.message({ type: 'output', data: 'first snapshot' });
    first.message({ type: 'ready', session_id: 'pty-1', name: 'shell', project_path: '/tmp' });

    connection.attach(24, 80, true);
    const second = socket();
    second.open();
    second.message({ type: 'output', data: 'second snapshot' });
    second.message({ type: 'ready', session_id: 'pty-1', name: 'shell', project_path: '/tmp' });

    expect(onClear).toHaveBeenCalledTimes(2);
    expect(onData.mock.calls.map(([data]) => data)).toEqual(['first snapshot', 'second snapshot']);
    connection.destroy();
  });

  it('coalesces pageshow, online and focus recovery into one socket', () => {
    const connection = new PtyConnection('7', 'pty-1');
    connection.attach();
    ready(socket());

    fakeWindow.dispatchEvent(new Event('pageshow'));
    fakeWindow.dispatchEvent(new Event('online'));
    fakeWindow.dispatchEvent(new Event('focus'));

    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(connection.status).toBe('connecting');
    connection.destroy();
  });

  it('removes timers and lifecycle listeners on destroy', () => {
    const connection = new PtyConnection('7', 'pty-1');
    connection.attach();
    ready(socket());
    connection.destroy();
    const countAfterDestroy = FakeWebSocket.instances.length;

    fakeWindow.dispatchEvent(new Event('pageshow'));
    fakeWindow.dispatchEvent(new Event('online'));
    fakeDocument.visibilityState = 'hidden';
    fakeDocument.dispatchEvent(new Event('visibilitychange'));
    fakeDocument.visibilityState = 'visible';
    fakeDocument.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(120000);

    expect(FakeWebSocket.instances).toHaveLength(countAfterDestroy);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('drops input during resume and only sends a new keystroke after ready', () => {
    const connection = new PtyConnection('7', 'pty-1');
    connection.attach();
    ready(socket());
    fakeWindow.dispatchEvent(new Event('pageshow'));
    const resumed = socket();

    connection.sendInput('stale-enter\r');
    ready(resumed);
    connection.sendInput('fresh-enter\r');

    expect(sentMessages(resumed)).not.toContainEqual({ type: 'input', data: 'stale-enter\r' });
    expect(sentMessages(resumed)).toContainEqual({ type: 'input', data: 'fresh-enter\r' });
    connection.destroy();
  });

  it('retries a websocket which never opens or reaches ready', () => {
    const connection = new PtyConnection('7', 'pty-1');
    connection.attach();

    vi.advanceTimersByTime(12000);
    expect(connection.status).toBe('disconnected');
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    connection.destroy();
  });

  it('replaces a timed-out connecting socket when becoming visible', () => {
    const connection = new PtyConnection('7', 'pty-1');
    connection.attach();
    fakeDocument.visibilityState = 'hidden';
    fakeDocument.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(15000);
    expect(FakeWebSocket.instances).toHaveLength(1);

    fakeDocument.visibilityState = 'visible';
    fakeDocument.dispatchEvent(new Event('visibilitychange'));
    expect(FakeWebSocket.instances).toHaveLength(2);
    connection.destroy();
  });

  it('does not reconnect a healthy cached socket on an ordinary focus event', () => {
    const connection = new PtyConnection('7', 'pty-1');
    connection.attach();
    ready(socket());

    fakeWindow.dispatchEvent(new Event('focus'));
    expect(FakeWebSocket.instances).toHaveLength(1);
    connection.destroy();
  });

  it('uses pong as a liveness acknowledgement and replaces a half-open socket', () => {
    const connection = new PtyConnection('7', 'pty-1');
    connection.attach();
    const first = socket();
    ready(first);

    vi.advanceTimersByTime(30000);
    expect(sentMessages(first)).toContainEqual({ type: 'ping' });
    first.message({ type: 'pong' });
    vi.advanceTimersByTime(30000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(30000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    connection.destroy();
  });

  it('does not declare a socket stale while background timers are suspended', () => {
    const connection = new PtyConnection('7', 'pty-1');
    connection.attach();
    ready(socket());
    fakeDocument.visibilityState = 'hidden';
    fakeDocument.dispatchEvent(new Event('visibilitychange'));

    vi.advanceTimersByTime(180000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    connection.destroy();
  });
});

describe('PtyStateConnection lifecycle', () => {
  it('reconnects after close instead of invalidating its own current-socket check', () => {
    const onConnected = vi.fn();
    const connection = new PtyStateConnection('7');
    connection.setOnConnected(onConnected);
    connection.connect();
    const first = socket();
    first.open();
    first.emitClose();

    expect(onConnected).toHaveBeenLastCalledWith(false);
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    connection.destroy();
  });

  it('replaces a stale state stream on foreground and ignores its old data', () => {
    const onSessions = vi.fn();
    const connection = new PtyStateConnection('7');
    connection.setOnSessions(onSessions);
    connection.connect();
    const first = socket();
    first.open();
    fakeWindow.dispatchEvent(new Event('pageshow'));
    const second = socket();

    first.message({ type: 'pty_state', sessions: [{ id: 'stale' }] });
    second.open();
    second.message({ type: 'pty_state', sessions: [{ id: 'fresh' }] });

    expect(onSessions).toHaveBeenCalledTimes(1);
    expect(onSessions).toHaveBeenCalledWith([{ id: 'fresh' }]);
    connection.destroy();
  });
});
