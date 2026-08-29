import { create } from 'zustand';
import {
  fetchCapabilities,
  CLOSED_CAPABILITIES,
  type Capabilities,
} from '../api/capabilities';

interface CapabilitiesState {
  capabilities: Capabilities;
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  reset: () => void;
}

export const useCapabilitiesStore = create<CapabilitiesState>((set) => ({
  capabilities: CLOSED_CAPABILITIES,
  loaded: false,
  error: null,
  load: async () => {
    try {
      const capabilities = await fetchCapabilities();
      set({ capabilities, loaded: true, error: null });
    } catch (error) {
      set({
        capabilities: CLOSED_CAPABILITIES,
        loaded: true,
        error: error instanceof Error ? error.message : 'Capability discovery failed',
      });
    }
  },
  reset: () => set({ capabilities: CLOSED_CAPABILITIES, loaded: false, error: null }),
}));
