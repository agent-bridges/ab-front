import { describe, expect, it } from 'vitest';
import { getAgentActivityLabel, getProcessStatus, getTerminalStatusMeta } from './ProcessIndicator';

describe('process status', () => {
  it('does not present missing liveness or process state as idle', () => {
    expect(getProcessStatus()).toBe('unknown');
    expect(getProcessStatus(true)).toBe('unknown');
  });

  it('does not assume an AI process is idle without hook state', () => {
    expect(getProcessStatus(true, [{ pid: 1, cmd: 'codex', args: '' }])).toBe('unknown');
  });

  it('uses idle only for an authoritative empty live process list', () => {
    expect(getProcessStatus(true, [])).toBe('idle');
  });

  it('keeps explicit dead and AI hook states', () => {
    expect(getProcessStatus(false)).toBe('dead');
    expect(getProcessStatus(true, [{ pid: 1, cmd: 'codex', args: '' }], 'idle')).toBe('ai-idle');
    expect(getProcessStatus(true, [{ pid: 1, cmd: 'codex', args: '' }], 'working')).toBe('ai-busy');
  });
});

describe('agent activity label', () => {
  const codex = [{ pid: 1, cmd: 'codex', args: '' }];

  it('states Codex activity explicitly', () => {
    expect(getAgentActivityLabel(getTerminalStatusMeta(true, codex, 'working'))?.text).toBe('Codex · working');
    expect(getAgentActivityLabel(getTerminalStatusMeta(true, codex, 'tool:rg'))?.text).toBe('Codex · rg');
    expect(getAgentActivityLabel(getTerminalStatusMeta(true, codex, 'idle'))?.text).toBe('Codex · ready');
  });

  it('does not claim activity when live status is missing', () => {
    expect(getAgentActivityLabel(getTerminalStatusMeta(true, codex, ''))?.text).toBe('Codex · status unknown');
    expect(getAgentActivityLabel(getTerminalStatusMeta(true, [], ''))).toBeNull();
  });
});
