/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // Surfaces (warm paper + ink). One meaning per semantic color.
        paper: { DEFAULT: '#E2E3E5', 2: '#FFFFFF', 3: '#D3D5D8' },
        ink: { DEFAULT: '#1A1A1A', 2: '#3D3D3D', 3: '#6B6B6B', 4: '#9C9C9C' },
        line: { DEFAULT: '#B4B7BB', 2: '#C8CBCF' },
        // Semantic (strict): editable, recommended, caution, danger, ok
        edit: { DEFAULT: '#2E5E86', soft: '#E4ECF3' },        // anything the user can change
        rec: { DEFAULT: '#174D38', soft: '#E3EDE7' },         // recommended path / targets / base case
        ok: { DEFAULT: '#2B7A4B', soft: '#E3F0E8' },          // on track / normal
        warn: { DEFAULT: '#B5740A', soft: '#F7EBD6' },        // caution / unverified data
        danger: { DEFAULT: '#4D1717', soft: '#F0E3E3' },      // genuine problems only
        // Asset classes: muted blues/tans that never collide with semantics
        asset: {
          uslc: '#2F5F4A', ussmid: '#4F8068', intl: '#7FA592', em: '#AFC8BA',
          bonds: '#8B6F47', tips: '#B59B73', cash: '#D9C9AD',
        },
      },
      borderRadius: { card: '10px', pill: '999px' },
      boxShadow: {
        card: '0 1px 2px rgba(20,22,26,0.04), 0 1px 1px rgba(20,22,26,0.03)',
        pop: '0 8px 24px rgba(20,22,26,0.12)',
      },
      fontSize: { xxs: ['11px', '14px'] },
    },
  },
  plugins: [],
};
