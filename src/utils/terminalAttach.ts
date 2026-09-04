export interface TerminalAttachIdentity {
  relayId: string;
  daemonFingerprint: string;
  ptyId: string;
}

const DAEMON_FINGERPRINT = /^[0-9a-f]{64}$/;
const RELAY_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const PTY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/;

function canonicalIdentity(value: string, pattern: RegExp, label: string): string {
  if (!pattern.test(value)) throw new Error(`${label} is not canonical`);
  return value;
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** One POSIX shell word. No part of an identity can become shell syntax. */
export function quotePosixShellWord(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function buildTerminalAttachUri(identity: TerminalAttachIdentity): string {
  const relayId = canonicalIdentity(identity.relayId, RELAY_ID, 'relay id');
  const ptyId = canonicalIdentity(identity.ptyId, PTY_ID, 'PTY id');
  const daemonFingerprint = identity.daemonFingerprint.toLowerCase();
  if (!DAEMON_FINGERPRINT.test(daemonFingerprint)) {
    throw new Error('daemon fingerprint must contain exactly 64 hexadecimal characters');
  }
  return `ab://attach/${encodePathSegment(relayId)}/${daemonFingerprint}/${encodePathSegment(ptyId)}`;
}

export function buildTerminalAttachCommand(identity: TerminalAttachIdentity): string {
  const relayId = canonicalIdentity(identity.relayId, RELAY_ID, 'relay id');
  const ptyId = canonicalIdentity(identity.ptyId, PTY_ID, 'PTY id');
  const daemonFingerprint = identity.daemonFingerprint.toLowerCase();
  if (!DAEMON_FINGERPRINT.test(daemonFingerprint)) {
    throw new Error('daemon fingerprint must contain exactly 64 hexadecimal characters');
  }
  return `ab-cli attach --relay ${quotePosixShellWord(relayId)} --daemon ${quotePosixShellWord(daemonFingerprint)} --pty ${quotePosixShellWord(ptyId)}`;
}
