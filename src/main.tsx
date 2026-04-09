import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// Dev mode indicator — title + red favicon
if (import.meta.env.DEV) {
  document.title = 'dev.Agent-Bridge';
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180"><rect width="180" height="180" rx="36" fill="#0A0A0F"/><path d="M50 140 L90 40 L130 140" stroke="#e06c75" stroke-width="18" fill="none" stroke-linecap="round" stroke-linejoin="round"/><line x1="38" y1="105" x2="142" y2="105" stroke="#e06c75" stroke-width="14" stroke-linecap="round"/><text x="80" y="140" font-family="monospace" font-size="28" fill="#E4E4EF">></text></svg>`;
    link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
  }
}

createRoot(document.getElementById('root')!).render(<App />);
