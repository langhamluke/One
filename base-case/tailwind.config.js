/** @type {import('tailwindcss').Config} */
// Every color is a CSS variable (R G B triple) so one build serves both products:
// Base Case ("model desk", light paper) and Flight Plan (the original cockpit: dark panels, B612).
// The values live in src/styles/index.css under :root and :root[data-product="flight-plan"].
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      colors: {
        // Surfaces. One meaning per semantic color.
        paper: { DEFAULT: v('paper'), 2: v('paper-2'), 3: v('paper-3') },
        ink: { DEFAULT: v('ink'), 2: v('ink-2'), 3: v('ink-3'), 4: v('ink-4') },
        line: { DEFAULT: v('line'), 2: v('line-2') },
        // Semantic (strict): editable, recommended, caution, danger, ok
        edit: { DEFAULT: v('edit'), soft: v('edit-soft') },        // anything the user can change
        rec: { DEFAULT: v('rec'), soft: v('rec-soft') },           // recommended path / targets / the flight plan
        ok: { DEFAULT: v('ok'), soft: v('ok-soft') },              // on track / normal
        warn: { DEFAULT: v('warn'), soft: v('warn-soft') },        // caution / unverified data
        danger: { DEFAULT: v('danger'), soft: v('danger-soft') },  // genuine problems only
        // Asset classes: never collide with semantics
        asset: {
          uslc: v('a-uslc'), ussmid: v('a-ussmid'), intl: v('a-intl'), em: v('a-em'),
          bonds: v('a-bonds'), tips: v('a-tips'), cash: v('a-cash'),
        },
      },
      borderRadius: { card: 'var(--radius-card)', pill: '999px' },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
      fontSize: { xxs: ['11px', '14px'] },
    },
  },
  plugins: [],
};
