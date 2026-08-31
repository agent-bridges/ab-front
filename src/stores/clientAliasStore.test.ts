import { describe, expect, it } from 'vitest';
import type { Agent, PtySession } from '../types';
import { daemonDisplayName, sessionAliasKey, sessionDisplayName } from './clientAliasStore';

const agent = { id: 'home~abc', name: 'ab2' } as Agent;
const session = { id: 'pty-1', name: 'shell' } as PtySession;

describe('client aliases', () => {
  it('falls back to canonical names and overlays local labels', () => {
    expect(daemonDisplayName(agent, {})).toBe('ab2');
    expect(daemonDisplayName(agent, { 'home~abc': 'Home box' })).toBe('Home box');
    expect(sessionDisplayName(agent.id, session, {})).toBe('shell');
    expect(sessionDisplayName(agent.id, session, { [sessionAliasKey(agent.id, session.id)]: 'Deploy' })).toBe('Deploy');
  });

  it('keeps aliases for equal PTY ids on different daemons separate', () => {
    expect(sessionAliasKey('home~abc', 'pty-1')).not.toBe(sessionAliasKey('remote~abc', 'pty-1'));
  });
});
