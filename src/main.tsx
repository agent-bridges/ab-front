import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// Dev-instance indicator — hostname title + red favicon.
//
// Two signals mean "this is a dev instance": (a) we're running under the
// Vite dev server (`import.meta.env.DEV`), or (b) the back reports
// `env: 'dev'` in /api/auth/status (driven by the back container's AB_ENV
// env var). Either one flips the icon red so you can tell dev from prod
// tabs at a glance. Prod builds served against a prod back stay black.
fetch('/api/auth/status').then(r => r.json()).then(d => {
  const isDev = import.meta.env.DEV || d?.env === 'dev';
  if (!isDev) return;
  document.title = d.hostname || location.host;
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180"><rect width="180" height="180" rx="36" fill="#0A0A0F"/><path d="M50 140 L90 40 L130 140" stroke="#e06c75" stroke-width="18" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="38" y1="105" x2="142" y2="105" stroke="#e06c75" stroke-width="14" stroke-linecap="round"/><text x="80" y="140" font-family="monospace" font-size="28" fill="#E4E4EF">></text></svg>`;
    link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
  }
}).catch(() => {
  // Fall back to vite-dev-only signal if /api/auth/status is unreachable.
  if (import.meta.env.DEV) document.title = location.host;
});

// Apply saved theme
const savedTheme = localStorage.getItem('ab-theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

// Listen for theme changes
window.addEventListener('ab-settings-change', (e) => {
  const theme = (e as CustomEvent).detail?.theme;
  if (theme) document.documentElement.setAttribute('data-theme', theme);
});

createRoot(document.getElementById('root')!).render(<App />);
