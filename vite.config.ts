import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const backendUrl = process.env.BACKEND_URL || 'http://localhost:8420';

function authGatePlugin(): Plugin {
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

        let isAuthorized = false;
        if (cookieHeader) {
          try {
            const resp = await fetch(`${backendUrl}/api/agents`, {
              headers: { cookie: cookieHeader },
            });
            isAuthorized = resp.ok;
          } catch {
            isAuthorized = false;
          }
        }

        if (!isAuthorized && !isLoginRoute) {
          res.statusCode = 302;
          res.setHeader('Location', '/login');
          res.end();
          return;
        }

        if (isAuthorized && isLoginRoute) {
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
  plugins: [react(), authGatePlugin()],
  server: {
    port: 5180,
    allowedHosts: true,
    proxy: {
      '/api': backendUrl,
      '/ws': {
        target: backendUrl,
        ws: true,
      },
    },
  },
});
