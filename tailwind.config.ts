import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: {
          bg: 'var(--canvas-bg)',
          surface: 'var(--canvas-surface)',
          border: 'var(--canvas-border)',
          accent: 'var(--canvas-accent)',
          text: 'var(--canvas-text)',
          muted: 'var(--canvas-muted)',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
