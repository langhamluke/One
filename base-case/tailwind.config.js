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
        paper: { DEFAULT: '#F7F6F2', 2: '#FFFFFF', 3: '#EFEDE7' },
        ink: { DEFAULT: '#14161A', 2: '#3C4048', 3: '#6B7078', 4: '#9A9FA6' },
        line: { DEFAULT: '#DAD7CF', 2: '#E9E7E1' },
        // Semantic (strict): editable, recommended, caution, danger, ok
        edit: { DEFAULT: '#1F5EFF', soft: '#E8EFFF' },        // anything the user can change
        rec: { DEFAULT: '#7A3EF0', soft: '#F0E9FF' },         // recommended path / targets / base case
        ok: { DEFAULT: '#1B9E5A', soft: '#E4F6EC' },          // on track / normal
        warn: { DEFAULT: '#D98A00', soft: '#FFF3DC' },        // caution / unverified data
        danger: { DEFAULT: '#D6342B', soft: '#FDE8E6' },      // genuine problems only
        // Asset classes: muted blues/tans that never collide with semantics
        asset: {
          uslc: '#3B5B8C', ussmid: '#6C8CC1', intl: '#8FA8C8', em: '#B9C9DE',
          bonds: '#B08B5B', tips: '#D2B48C', cash: '#E6D7BE',
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
