import type { Capabilities } from '../api/capabilities';
import { useCapabilitiesStore } from '../stores/capabilitiesStore';

export type SettingsSection = 'visual' | 'account' | 'auth';

export interface ManagementEntrypoints {
  account: boolean;
  clientCertificates: boolean;
  relayAdministration: boolean;
}

export function managementEntrypointsForCapabilities(capabilities: Capabilities): ManagementEntrypoints {
  return {
    account: capabilities.passwordChange,
    clientCertificates: capabilities.clientCertManagement,
    relayAdministration: capabilities.relayMutation,
  };
}

export function settingsSectionsForCapabilities(capabilities: Capabilities): SettingsSection[] {
  return [
    'visual',
    ...(capabilities.passwordChange ? ['account' as const] : []),
    ...(capabilities.clientCertManagement ? ['auth' as const] : []),
  ];
}

export function useCapabilities(): Capabilities {
  return useCapabilitiesStore((state) => state.capabilities);
}
