import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forceRefresh, getCache } from './TerminalCache';

describe('forceRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getCache().clear();
  });

  afterEach(() => {
    getCache().clear();
    vi.useRealTimers();
  });

  it('fits only the selected terminal and nudges its PTY width to force redraw', () => {
    const fit = vi.fn();
    const sendResize = vi.fn();
    getCache().set('pty-1', {
      ptyId: 'pty-1',
      fitAddon: { fit } as never,
      term: { rows: 40, cols: 120 } as never,
      connection: { sendResize } as never,
      container: {} as never,
      lastUsed: 0,
      stickyToBottom: true,
    });

    forceRefresh('pty-1');
    expect(fit).toHaveBeenCalledOnce();
    expect(sendResize).toHaveBeenCalledWith(40, 119);
    expect(sendResize).not.toHaveBeenCalledWith(40, 120);

    vi.advanceTimersByTime(100);
    expect(sendResize).toHaveBeenLastCalledWith(40, 120);
  });
});
