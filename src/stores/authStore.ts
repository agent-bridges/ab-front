import { create } from 'zustand';

interface AuthState {
  username: string | null;
  isAuthenticated: boolean;
  setAuth: (username: string) => void;
  logout: () => void;
  checkInit: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  username: null,
  isAuthenticated: false,

  setAuth: (username) => {
    set({ username, isAuthenticated: true });
  },

  logout: () => {
    set({ username: null, isAuthenticated: false });
  },

  checkInit: () => {
    set((state) => state);
  },
}));
