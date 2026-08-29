import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function requiredBackendUrl(): string {
  const value = process.env.BACKEND_URL?.trim();
  if (!value) throw new Error('BACKEND_URL is required (for example, http://127.0.0.1:8720)');

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('BACKEND_URL must be a valid absolute http(s) URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('BACKEND_URL must be an http(s) origin without credentials, path, query, or fragment');
  }
  return parsed.origin;
}

const isTest = process.env.VITEST === 'true';
const backendUrl = isTest ? null : requiredBackendUrl();

function authGatePlugin(target: string): Plugin {
  return {
    name: 'ab-front-auth-gate',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const accept = req.headers.accept || '';
        const url = req.url || '/';

        if (req.method !== 'GET' || !accept.includes('text/html')) {
          return next();
        }

        const isLoginRoute = url === '/login' || url.startsWith('/login?');
        const cookieHeader = req.headers.cookie || '';

        let authorization: 'authorized' | 'unauthorized' | 'unavailable' = 'unavailable';
        try {
          const statusResponse = await fetch(`${target}/api/auth/status`, {
            headers: cookieHeader ? { cookie: cookieHeader } : undefined,
          });
          if (statusResponse.status === 401 || statusResponse.status === 403) {
            authorization = 'unauthorized';
          } else if (statusResponse.ok) {
            const status: unknown = await statusResponse.json();
            if (status && typeof status === 'object' && (status as Record<string, unknown>).auth_required === false) {
              authorization = 'authorized';
            } else if (status && typeof status === 'object' && (status as Record<string, unknown>).auth_required === true) {
              const relayResponse = await fetch(`${target}/api/relays`, {
                headers: cookieHeader ? { cookie: cookieHeader } : undefined,
              });
              authorization = relayResponse.ok
                ? 'authorized'
                : relayResponse.status === 401 || relayResponse.status === 403
                  ? 'unauthorized'
                  : 'unavailable';
            }
          }
        } catch {
          authorization = 'unavailable';
        }

        if (authorization === 'unauthorized' && !isLoginRoute) {
          res.statusCode = 302;
          res.setHeader('Location', '/login');
          res.end();
          return;
        }

        if (authorization === 'authorized' && isLoginRoute) {
          res.statusCode = 302;
          res.setHeader('Location', '/');
          res.end();
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), ...(backendUrl ? [authGatePlugin(backendUrl)] : [])],
  server: {
    port: 5180,
    allowedHosts: true,
    proxy: backendUrl ? {
      '/api': backendUrl,
      '/ws': {
        target: backendUrl,
        ws: true,
      },
    } : undefined,
  },
});
