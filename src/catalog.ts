// Rental packages offered for a season. Each package is one Stripe Product with
// one Price, addressed by a stable lookup key so prices can change in the
// Dashboard (or via scripts/seed-catalog.ts) without a code deploy.
//
// Sizes and age brackets are captured per child as Checkout metadata rather
// than as separate Prices, since the price is the same across sizes.

export const SEASON = '2026-27';

export const AGE_BRACKETS = ['2–4', '5–8', '9–12', '13–14'] as const;
export type AgeBracket = (typeof AGE_BRACKETS)[number];

export interface RentalPackage {
  lookupKey: string;
  name: string;
  description: string;
}

export const PACKAGES: readonly RentalPackage[] = [
  {
    lookupKey: `season_jacket_pants_${SEASON}`,
    name: `Season rental: jacket + pants (${SEASON})`,
    description: 'Kids ski jacket and snow pants for the full season. Swap sizes mid-season.',
  },
  {
    lookupKey: `season_full_kit_${SEASON}`,
    name: `Season rental: full kit (${SEASON})`,
    description: 'Jacket, snow pants, base layers, gloves and neck gaiter for the full season.',
  },
];

export function findPackage(lookupKey: string): RentalPackage | undefined {
  return PACKAGES.find((p) => p.lookupKey === lookupKey);
}

export function isAgeBracket(value: string): value is AgeBracket {
  return (AGE_BRACKETS as readonly string[]).includes(value);
}
