import { afterEach, describe, expect, it, vi } from 'vitest';
import { forceRefresh, getCache, type CachedTerminal } from './TerminalCache';

describe('forceRefresh', () => {
  afterEach(() => {
    getCache().clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('pins the viewport and replay to the terminal tail', () => {
    vi.useFakeTimers();
    const scrollToBottom = vi.fn();
    const sendResize = vi.fn();
    const fit = vi.fn();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const cached = {
      term: { rows: 40, cols: 100, scrollToBottom },
      fitAddon: { fit },
      connection: { sendResize },
      stickyToBottom: false,
      forceBottomAfterReplay: false,
      forceBottomUntil: 0,
      restoreDistanceFromBottom: 300,
    } as unknown as CachedTerminal;
    getCache().set('pty-1', cached);

    forceRefresh('pty-1');
    vi.advanceTimersByTime(1_800);

    expect(cached.stickyToBottom).toBe(true);
    expect(cached.forceBottomAfterReplay).toBe(true);
    expect(cached.forceBottomUntil).toBeGreaterThan(Date.now());
    expect(cached.restoreDistanceFromBottom).toBeNull();
    expect(scrollToBottom).toHaveBeenCalledTimes(5);
    expect(fit).toHaveBeenCalledOnce();
    expect(sendResize).toHaveBeenNthCalledWith(1, 40, 99);
    expect(sendResize).toHaveBeenNthCalledWith(2, 40, 100);
  });
});
