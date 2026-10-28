import type { AssetClass } from '../lib/types';

/** Muted, non-semantic palette (kept away from the green/cyan/magenta/amber/red flight-deck colors). */
export const ASSET_COLORS: Record<AssetClass, string> = {
  usLarge: '#6F93C7',
  usSmallMid: '#4E6F9E',
  intlDev: '#9DB4D6',
  emerging: '#38557F',
  usAgg: '#A89F8C',
  tips: '#C9BFA6',
  cash: '#6E6A61',
};

/** Print-friendly variants for the light Briefing page. */
export const ASSET_COLORS_PRINT: Record<AssetClass, string> = {
  usLarge: '#2F5D9A',
  usSmallMid: '#4C77B0',
  intlDev: '#7FA0CC',
  emerging: '#1F3D66',
  usAgg: '#8A7F67',
  tips: '#B6A983',
  cash: '#5A564E',
};

/** Chart draw-in animation, disabled when the user prefers reduced motion. */
export const CHART_ANIM = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;
