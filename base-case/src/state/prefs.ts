/** UI preferences only (never plan data). Persisted to localStorage through the safe wrapper. */
import { create } from 'zustand';
import type { DollarBasis, ViewMode } from '@shared/lib/types';
import { readPref, writePref } from '@/lib/storage';

interface Prefs {
  basis: DollarBasis;
  viewMode: ViewMode;
  collapsed: Record<string, boolean>;
  tables: Record<string, boolean>;
  setBasis: (b: DollarBasis) => void;
  setViewMode: (v: ViewMode) => void;
  toggleCollapsed: (key: string, def?: boolean) => void;
  isCollapsed: (key: string, def?: boolean) => boolean;
  toggleTable: (key: string) => void;
}

export const usePrefs = create<Prefs>((set, get) => ({
  basis: readPref<DollarBasis>('basis', 'today'),
  viewMode: readPref<ViewMode>('viewMode', 'client'),
  collapsed: readPref<Record<string, boolean>>('collapsed', {}),
  tables: {},
  setBasis: (basis) => {
    writePref('basis', basis);
    set({ basis });
  },
  setViewMode: (viewMode) => {
    writePref('viewMode', viewMode);
    set({ viewMode });
  },
  toggleCollapsed: (key, def = false) => {
    const cur = get().collapsed[key] ?? def;
    const collapsed = { ...get().collapsed, [key]: !cur };
    writePref('collapsed', collapsed);
    set({ collapsed });
  },
  isCollapsed: (key, def = false) => get().collapsed[key] ?? def,
  toggleTable: (key) => set({ tables: { ...get().tables, [key]: !get().tables[key] } }),
}));
