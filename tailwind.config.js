/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0B0F14',
        panel: '#121821',
        panel2: '#0F141B',
        edge: '#243042',
        dim: '#8A99AD',
        faint: '#5C6B80',
        ok: '#3DDC84',
        sel: '#4FD1FF',
        plan: '#FF4FD8',
        caution: '#FFB020',
        warn: '#FF4D4D',
      },
      fontFamily: {
        sans: ['"B612"', 'system-ui', 'sans-serif'],
        mono: ['"B612 Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        bezel: 'inset 0 1px 0 rgba(255,255,255,0.03), inset 0 0 0 1px rgba(0,0,0,0.35), inset 0 8px 24px rgba(0,0,0,0.25)',
      },
    },
  },
  plugins: [],
};
