import { useState } from 'react';
import { login } from '../../api/auth';
import { useAuthStore } from '../../stores/authStore';

interface LoginPageProps {
  onLoggedIn?: () => void;
}

export default function LoginPage({ onLoggedIn }: LoginPageProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const result = await login(username || 'admin', password);
    setLoading(false);
    if (result.ok) {
      setAuth(result.username || username || 'admin');
      onLoggedIn?.();
    } else {
      setError(result.error || 'Login failed');
    }
  };

  return (
    <div className="h-full flex items-center justify-center bg-canvas-bg">
      <form onSubmit={handleSubmit} className="w-80 p-6 bg-canvas-surface border border-canvas-border rounded-xl">
        <h1 className="text-lg font-semibold text-canvas-text mb-1">Agent Bridge</h1>
        <p className="mb-4 text-sm text-canvas-muted">Sign in to continue</p>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoFocus
          className="w-full px-3 py-2 mb-3 bg-canvas-bg border border-canvas-border rounded-lg text-canvas-text placeholder-canvas-muted focus:outline-none focus:border-canvas-accent"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full px-3 py-2 bg-canvas-bg border border-canvas-border rounded-lg text-canvas-text placeholder-canvas-muted focus:outline-none focus:border-canvas-accent"
        />
        {error && (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          >
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full mt-4 py-2 bg-canvas-accent text-canvas-bg rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
