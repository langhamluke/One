/**
 * Products built on the same platform. One codebase, one engine, one server; a deployment picks its product with the
 * PRODUCT environment variable and every instance gets its own name, phase labels, questionnaire wording, supplement,
 * demo personas and default career model.
 *
 *  - base-case   : new college graduates in any industry (BLS career ladders).
 *  - flight-plan : airline pilots (airline pay scales, seat/longevity progression, flow, furlough, §415(c) spillover).
 *
 * Pure TypeScript: shared by the server (config, seed, assistant) and the client (branding, screens).
 */
export type ProductKey = 'base-case' | 'flight-plan';

export interface PhaseDef {
  /** Route segment under /plan (stable across products) */
  key: 'profile' | 'risk' | 'career' | 'plan' | 'future' | 'summary';
  label: string;
  hint: string;
}

export interface ProductConfig {
  key: ProductKey;
  name: string;
  /** One line under the name on the sign-in page and the home screen */
  tagline: string;
  /** Who the plan is for, used in copy ("your plan as a new graduate" / "your plan as a pilot") */
  audience: string;
  phases: PhaseDef[];
  /** Default kind for a new career path */
  defaultCareerKind: 'ladder' | 'airline';
  /** Mandatory retirement age for the primary career, if any (FAA Part 121: 65) */
  careerAgeLimit?: number;
  /** Default retirement age for a new plan */
  defaultRetirementAge: number;
  /** Demo e-mail domain for seeded personas */
  demoDomain: string;
  /** Tag written into exported JSON files */
  exportTag: string;
}

export const PRODUCTS: Record<ProductKey, ProductConfig> = {
  'base-case': {
    key: 'base-case',
    name: 'Base Case',
    tagline: 'Financial planning for new graduates',
    audience: 'new graduate',
    phases: [
      { key: 'profile', label: 'Profile', hint: 'Intake' },
      { key: 'risk', label: 'Risk', hint: 'Risk questionnaire' },
      { key: 'career', label: 'Career', hint: 'Career paths compared' },
      { key: 'plan', label: 'Plan', hint: 'Allocation and order of operations' },
      { key: 'future', label: 'Future', hint: 'Retirement projection' },
      { key: 'summary', label: 'Summary', hint: 'Printable summary' },
    ],
    defaultCareerKind: 'ladder',
    defaultRetirementAge: 67,
    demoDomain: 'demo.basecase.local',
    exportTag: 'base-case',
  },
  'flight-plan': {
    key: 'flight-plan',
    name: 'Flight Plan',
    tagline: 'Financial planning for airline pilots',
    audience: 'pilot',
    phases: [
      { key: 'profile', label: 'Preflight', hint: 'Intake' },
      { key: 'risk', label: 'Checklist', hint: 'Risk questionnaire' },
      { key: 'career', label: 'Flight plan', hint: 'Career and airline compare' },
      { key: 'plan', label: 'Cruise', hint: 'Allocation and contributions' },
      { key: 'future', label: 'Landing', hint: 'Retirement projection' },
      { key: 'summary', label: 'Briefing', hint: 'Printable summary' },
    ],
    defaultCareerKind: 'airline',
    careerAgeLimit: 65,
    defaultRetirementAge: 65,
    demoDomain: 'demo.flightplan.local',
    exportTag: 'flight-plan',
  },
};

export const PRODUCT_KEYS = Object.keys(PRODUCTS) as ProductKey[];

export function isProductKey(x: unknown): x is ProductKey {
  return typeof x === 'string' && (PRODUCT_KEYS as string[]).includes(x);
}

/** Resolve a product key from an environment string; unknown or empty values fall back to Base Case. */
export function productFromEnv(value: string | undefined | null): ProductKey {
  const v = (value ?? '').trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (v === 'flightplan') return 'flight-plan';
  if (v === 'basecase') return 'base-case';
  return isProductKey(v) ? v : 'base-case';
}

export function productConfig(key: ProductKey | string | undefined | null): ProductConfig {
  return PRODUCTS[isProductKey(key) ? key : 'base-case'];
}

export function phaseLabel(key: ProductKey | string | undefined | null, phase: PhaseDef['key']): string {
  return productConfig(key).phases.find((p) => p.key === phase)?.label ?? phase;
}
