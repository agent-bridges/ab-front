import { create } from 'zustand';
import {
  fetchCapabilities,
  LEGACY_CAPABILITIES,
  type Capabilities,
} from '../api/capabilities';

interface CapabilitiesState {
  capabilities: Capabilities;
  loaded: boolean;
  load: () => Promise<void>;
  reset: () => void;
}

export const useCapabilitiesStore = create<CapabilitiesState>((set) => ({
  capabilities: LEGACY_CAPABILITIES,
  loaded: false,
  load: async () => {
    const capabilities = await fetchCapabilities();
    set({ capabilities, loaded: true });
  },
  reset: () => set({ capabilities: LEGACY_CAPABILITIES, loaded: false }),
}));
