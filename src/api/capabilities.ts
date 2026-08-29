import { authFetch } from './client';

export interface Capabilities {
  transport: string;
  agentMutation: boolean;
  passwordChange: boolean;
  clientCertManagement: boolean;
  directAgents: boolean;
  relayRoutes: boolean;
  relayMutation: boolean;
  files: boolean;
  tunnels: boolean;
  canvas: boolean;
}

export const CLOSED_CAPABILITIES: Capabilities = {
  transport: 'unavailable',
  agentMutation: false,
  passwordChange: false,
  clientCertManagement: false,
  directAgents: false,
  relayRoutes: false,
  relayMutation: false,
  files: false,
  tunnels: false,
  canvas: false,
};

type CapabilityPayload = Record<string, unknown>;

function booleanCapability(payload: CapabilityPayload, key: string, fallback: boolean): boolean {
  return typeof payload[key] === 'boolean' ? payload[key] : fallback;
}

export function parseCapabilities(payload: unknown): Capabilities {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Capability discovery returned an invalid response');
  }

  const raw = payload as CapabilityPayload;
  const transport = typeof raw.transport === 'string' ? raw.transport : 'unavailable';

  return {
    transport,
    agentMutation: booleanCapability(raw, 'agent_mutation', false),
    passwordChange: booleanCapability(raw, 'password_change', false),
    clientCertManagement: booleanCapability(raw, 'client_cert_management', false),
    directAgents: booleanCapability(raw, 'direct_agents', false),
    relayRoutes: booleanCapability(raw, 'relay_routes', false),
    relayMutation: booleanCapability(raw, 'relay_mutation', false),
    files: booleanCapability(raw, 'files', false),
    tunnels: booleanCapability(raw, 'tunnels', false),
    canvas: booleanCapability(raw, 'canvas', false),
  };
}

export async function fetchCapabilities(): Promise<Capabilities> {
  const response = await authFetch('/api/capabilities', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Capability discovery failed (${response.status})`);
  return parseCapabilities(await response.json());
}
