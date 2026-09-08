import { describe, expect, it, vi } from 'vitest';
import {
  followTerminalTail,
  isTerminalAtBottom,
  nextScrollbackLimit,
  restoredViewportLine,
  type TerminalViewportLike,
} from './terminalViewport';

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

  it('loads older scrollback in bounded growing windows', () => {
    expect(nextScrollbackLimit(0, 4_000)).toBe(512);
    expect(nextScrollbackLimit(512, 4_000)).toBe(1_024);
    expect(nextScrollbackLimit(3_000, 4_000)).toBe(4_000);
    expect(nextScrollbackLimit(4_000, 4_000)).toBeNull();
  });

  it('restores the viewed content after older rows are prepended', () => {
    expect(restoredViewportLine(1_500, 900)).toBe(600);
    expect(restoredViewportLine(500, 900)).toBe(0);
  });
});
