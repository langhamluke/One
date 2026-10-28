/** A value with provenance. Every pay/benefit figure in the app is one of these. */
export interface Sourced<T = number> {
  value: T;
  source: string;
  url?: string;
  /** Date (YYYY-MM) the figure was reported/effective. */
  asOf: string;
  /** false → interpolated, estimated, or not confirmed against a primary document. Shown with VERIFY in Advisor Mode. */
  verified: boolean;
  note?: string;
}

export type Stage =
  | 'student'
  | 'cfi'
  | 'regional_fo'
  | 'regional_ca'
  | 'major_fo'
  | 'major_ca'
  | 'cargo_fo'
  | 'cargo_ca';

export type Seat = 'FO' | 'CA';
export type Fleet = 'NB' | 'WB';
export type FilingStatus = 'single' | 'mfj';
export type ExcessHandling = 'cash' | 'mbcb' | 'forfeit';

export type RiskCategory = 'Conservative' | 'Moderate' | 'Assertive' | 'Aggressive';
export type HorizonCategory = 'Short-term' | 'Intermediate' | 'Long-term';

export type AssetClass = 'usLarge' | 'usSmallMid' | 'intlDev' | 'emerging' | 'usAgg' | 'tips' | 'cash';
export type Allocation = Record<AssetClass, number>;
