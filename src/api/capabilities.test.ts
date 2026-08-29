import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLOSED_CAPABILITIES, fetchCapabilities, parseCapabilities } from './capabilities';
import {
  managementEntrypointsForCapabilities,
  settingsSectionsForCapabilities,
} from '../hooks/useCapabilities';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('capability discovery', () => {
  it('fails closed when the endpoint is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));

    await expect(fetchCapabilities()).rejects.toThrow('Capability discovery failed (404)');
  });

  it('fails closed when discovery is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network unavailable')));

    await expect(fetchCapabilities()).rejects.toThrow('network unavailable');
    expect(managementEntrypointsForCapabilities(CLOSED_CAPABILITIES)).toEqual({
      connections: false,
      account: false,
      clientCertificates: false,
      relayAdministration: false,
    });
    expect(CLOSED_CAPABILITIES).toMatchObject({
      agentMutation: false,
      passwordChange: false,
      clientCertManagement: false,
      directAgents: false,
      relayRoutes: false,
      relayMutation: false,
      files: false,
      tunnels: false,
      canvas: false,
    });
  });

  it('honours explicit Rust false flags and removes all unsupported entrypoints', () => {
    const capabilities = parseCapabilities({
      transport: 'relay_core',
      agent_mutation: false,
      password_change: false,
      client_cert_management: false,
      relay_mutation: false,
      relay_routes: true,
      files: true,
      tunnels: true,
      canvas: true,
    });

    expect(managementEntrypointsForCapabilities(capabilities)).toEqual({
      connections: false,
      account: false,
      clientCertificates: false,
      relayAdministration: false,
    });
    expect(settingsSectionsForCapabilities(capabilities)).toEqual(['visual']);
    expect(capabilities.relayRoutes).toBe(true);
    expect(capabilities.files).toBe(true);
    expect(capabilities.tunnels).toBe(true);
    expect(capabilities.canvas).toBe(true);
  });

  it('treats omitted sensitive fields conservatively on early Rust services', () => {
    const capabilities = parseCapabilities({ transport: 'relay_core', agent_mutation: false });

    expect(capabilities.passwordChange).toBe(false);
    expect(capabilities.clientCertManagement).toBe(false);
  });
});
