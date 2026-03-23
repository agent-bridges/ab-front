import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: {
          bg: '#0a0a0f',
          surface: '#12121a',
          border: '#1e1e2e',
          accent: '#d4a574',
          text: '#e4e4ef',
          muted: '#5c5c6e',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
