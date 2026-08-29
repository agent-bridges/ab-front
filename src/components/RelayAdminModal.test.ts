import { describe, expect, it } from 'vitest';
import {
  normalizeRelayFingerprint,
  relayFormPayload,
  validateRelayForm,
  type RelayFormState,
} from './RelayAdminModal';

const fingerprint = 'AB:CD:EF:01\n'.repeat(8);

function form(overrides: Partial<RelayFormState> = {}): RelayFormState {
  return {
    id: 'home',
    name: 'Home relay',
    address: '192.168.1.7:9500',
    serverFingerprint: fingerprint,
    enabled: true,
    ...overrides,
  };
}

describe('relay admin form', () => {
  it('normalizes multiline colon-delimited public pins', () => {
    expect(normalizeRelayFingerprint(fingerprint)).toBe('abcdef01'.repeat(8));
    expect(relayFormPayload(form())).toMatchObject({
      id: 'home',
      server_fingerprint: 'abcdef01'.repeat(8),
      enabled: true,
    });
  });

  it('validates create-only ids and exact SHA-256 pin length', () => {
    expect(validateRelayForm(form({ id: 'bad~route' }), true)).toContain('ID must start');
    expect(validateRelayForm(form({ id: 'Home' }), true)).toContain('lowercase');
    expect(validateRelayForm(form({ id: '_home' }), true)).toContain('must start');
    expect(validateRelayForm(form({ id: `a${'b'.repeat(64)}` }), true)).toContain('must start');
    expect(validateRelayForm(form({ id: 'home_2' }), true)).toBeNull();
    expect(validateRelayForm(form({ id: 'ignored-on-edit' }), false)).toBeNull();
    expect(validateRelayForm(form({ serverFingerprint: 'abcd' }), true)).toContain('64 hexadecimal');
  });
});
