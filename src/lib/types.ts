export type AssetClass =
  | 'usStocks'
  | 'intlStocks'
  | 'emStocks'
  | 'bonds'
  | 'cash'
  | 'realEstate'
  | 'commodities'
  | 'crypto';

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  usStocks: 'U.S. stocks',
  intlStocks: 'International stocks',
  emStocks: 'Emerging-market stocks',
  bonds: 'Bonds',
  cash: 'Cash',
  realEstate: 'Real estate',
  commodities: 'Commodities',
  crypto: 'Crypto',
};

export const ASSET_CLASSES = Object.keys(ASSET_CLASS_LABELS) as AssetClass[];

export type HoldingKind = 'etf' | 'mutualFund' | 'stock' | 'crypto' | 'cash';

export interface Holding {
  id: string;
  symbol: string;
  name: string;
  kind: HoldingKind;
  /** Current market value in dollars. */
  value: number;
  exposure: Partial<Record<AssetClass, number>>;
  sectors: Record<string, number>;
  expenseRatio: number;
}

export type RiskProfile = 'cautious' | 'balanced' | 'growth' | 'aggressive';

export const RISK_PROFILE_LABELS: Record<RiskProfile, string> = {
  cautious: 'Cautious',
  balanced: 'Balanced',
  growth: 'Growth',
  aggressive: 'Aggressive',
};

export type Severity = 'good' | 'info' | 'warn' | 'alert';

export interface Insight {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  /** A short "why this matters" learning nugget. */
  learn?: string;
}
