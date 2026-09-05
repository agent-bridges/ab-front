import { describe, expect, it } from 'vitest';
import type { Agent, PtySession } from '../types';
import { daemonDisplayName, sessionDisplayName } from './clientAliasStore';

const agent = { id: 'home~abc', name: 'ab2' } as Agent;
const session = { id: 'pty-1', name: 'shell' } as PtySession;

describe('server-owned display names', () => {
  it('uses PTY labels with the canonical name as the explicit empty-label rule', () => {
    expect(daemonDisplayName(agent)).toBe('ab2');
    expect(sessionDisplayName(session)).toBe('shell');
    expect(sessionDisplayName({ ...session, label: 'Deploy' })).toBe('Deploy');
  });
});
