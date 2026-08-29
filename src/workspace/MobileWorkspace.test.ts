import { describe, expect, it } from 'vitest';
import { isMobileWidth, MOBILE_BREAKPOINT } from '../hooks/useIsMobile';
import { boardKey, MOBILE_TILE_LABEL_LINES, reconcileMobileOrder, sessionKey } from './MobileWorkspace';

describe('mobile workspace routing', () => {
  it('uses the historical Canvas layout below the md breakpoint', () => {
    expect(isMobileWidth(390)).toBe(true);
    expect(isMobileWidth(MOBILE_BREAKPOINT - 1)).toBe(true);
    expect(isMobileWidth(MOBILE_BREAKPOINT)).toBe(false);
  });

  it('keeps stable session and board tab identities', () => {
    expect(sessionKey('pty-1')).toBe('session:pty-1');
    expect(boardKey('note-1')).toBe('board:note-1');
  });

  it('reserves two lines for mobile tile names', () => {
    expect(MOBILE_TILE_LABEL_LINES).toBe(2);
  });

  it('retains the mobile tile order while adding and pruning live entries', () => {
    expect(reconcileMobileOrder(['session:b', 'session:a', 'gone'], ['session:a', 'session:b', 'board:c']))
      .toEqual(['session:b', 'session:a', 'board:c']);
  });
});
