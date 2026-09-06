/** The small public xterm surface needed by the follow-tail policy. */
export interface TerminalViewportLike {
  buffer: {
    active: {
      baseY: number;
      viewportY: number;
    };
  };
  scrollToBottom(): void;
}

/** Only the actual last row is the tail; one row of history is still history. */
export function isTerminalAtBottom(term: TerminalViewportLike): boolean {
  return term.buffer.active.viewportY === term.buffer.active.baseY;
}

/**
 * xterm keeps an absolute history viewport stable while new rows are written.
 * The application therefore has one job: do not override it unless the user
 * was already following the tail.
 */
export function followTerminalTail(term: TerminalViewportLike, follow: boolean): void {
  if (follow) term.scrollToBottom();
}
