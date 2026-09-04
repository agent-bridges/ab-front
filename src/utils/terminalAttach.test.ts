import { describe, expect, it } from 'vitest';
import { buildTerminalAttachCommand, buildTerminalAttachUri, quotePosixShellWord } from './terminalAttach';

const fingerprint = 'Ab'.repeat(32);

describe('terminal attach links', () => {
  it('builds the canonical URL from stable identities only', () => {
    expect(buildTerminalAttachUri({
      relayId: 'home_relay-1',
      daemonFingerprint: fingerprint,
      ptyId: 'Pty.1_test-2',
    })).toBe(`ab://attach/home_relay-1/${fingerprint.toLowerCase()}/Pty.1_test-2`);
  });

  it('rejects identities the launcher cannot accept', () => {
    for (const relayId of ['', 'Home', '_home', 'home relay', 'home/relay', `a${'b'.repeat(64)}`]) {
      expect(() => buildTerminalAttachUri({ relayId, daemonFingerprint: fingerprint, ptyId: 'pty' })).toThrow('relay id');
    }
    for (const ptyId of ['', '.pty', 'pty id', 'pty/id', 'pty?id', `a${'b'.repeat(256)}`]) {
      expect(() => buildTerminalAttachUri({ relayId: 'home', daemonFingerprint: fingerprint, ptyId })).toThrow('PTY id');
    }
    expect(() => buildTerminalAttachUri({ relayId: 'home', daemonFingerprint: 'not-a-fingerprint', ptyId: 'pty' })).toThrow('64 hexadecimal');
  });

  it('quotes every CLI identity as one POSIX shell word', () => {
    expect(quotePosixShellWord(`relay $(touch nope) 'quoted'`)).toBe(`'relay $(touch nope) '"'"'quoted'"'"''`);
    expect(buildTerminalAttachCommand({
      relayId: 'home_relay-1',
      daemonFingerprint: fingerprint,
      ptyId: 'Pty.1_test-2',
    })).toBe(
      `ab-cli attach --relay 'home_relay-1' --daemon '${fingerprint.toLowerCase()}' --pty 'Pty.1_test-2'`,
    );
  });
});
