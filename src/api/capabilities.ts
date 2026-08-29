import { authFetch } from './client';

export interface Capabilities {
  transport: string;
  agentMutation: boolean;
  passwordChange: boolean;
  clientCertManagement: boolean;
  directAgents: boolean;
  relayRoutes: boolean;
  files: boolean;
  tunnels: boolean;
  canvas: boolean;
}

export const LEGACY_CAPABILITIES: Capabilities = {
  transport: 'legacy',
  agentMutation: true,
  passwordChange: true,
  clientCertManagement: true,
  directAgents: true,
  relayRoutes: false,
  files: true,
  tunnels: true,
  canvas: true,
};

type CapabilityPayload = Record<string, unknown>;

function booleanCapability(payload: CapabilityPayload, key: string, fallback: boolean): boolean {
  return typeof payload[key] === 'boolean' ? payload[key] : fallback;
}

export function parseCapabilities(payload: unknown): Capabilities {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return LEGACY_CAPABILITIES;
  }

  const raw = payload as CapabilityPayload;
  const transport = typeof raw.transport === 'string' ? raw.transport : 'legacy';
  // Early ab-core-service builds only advertised agent_mutation. Treat omitted
  // sensitive management features conservatively there; a legacy endpoint that
  // does not exist is handled separately by fetchCapabilities() below.
  const relayCoreDefault = transport === 'relay_core' ? false : true;

  return {
    transport,
    agentMutation: booleanCapability(raw, 'agent_mutation', relayCoreDefault),
    passwordChange: booleanCapability(raw, 'password_change', relayCoreDefault),
    clientCertManagement: booleanCapability(raw, 'client_cert_management', relayCoreDefault),
    directAgents: booleanCapability(raw, 'direct_agents', relayCoreDefault),
    relayRoutes: booleanCapability(raw, 'relay_routes', false),
    files: booleanCapability(raw, 'files', true),
    tunnels: booleanCapability(raw, 'tunnels', true),
    canvas: booleanCapability(raw, 'canvas', true),
  };
}

export async function fetchCapabilities(): Promise<Capabilities> {
  try {
    const response = await authFetch('/api/capabilities', { cache: 'no-store' });
    if (!response.ok) return LEGACY_CAPABILITIES;
    return parseCapabilities(await response.json());
  } catch {
    // ab-back predates capability discovery. Keeping all legacy controls is
    // intentional when the endpoint is missing or cannot be reached.
    return LEGACY_CAPABILITIES;
  }
}
