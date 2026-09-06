import { describe, expect, it, vi } from 'vitest';
import { followTerminalTail, isTerminalAtBottom, type TerminalViewportLike } from './terminalViewport';

function terminal(baseY: number, viewportY: number) {
  return {
    buffer: { active: { baseY, viewportY } },
    scrollToBottom: vi.fn(),
  } satisfies TerminalViewportLike;
}

describe('terminal viewport follow policy', () => {
  it('follows only from the exact bottom row', () => {
    expect(isTerminalAtBottom(terminal(120, 120))).toBe(true);
    expect(isTerminalAtBottom(terminal(120, 119))).toBe(false);
  });

  it('does not override xterm while the user reads history', () => {
    const term = terminal(120, 80);
    followTerminalTail(term, false);
    expect(term.scrollToBottom).not.toHaveBeenCalled();
  });

  it('keeps normal tail following when the user is at the bottom', () => {
    const term = terminal(120, 120);
    followTerminalTail(term, true);
    expect(term.scrollToBottom).toHaveBeenCalledOnce();
  });
});
