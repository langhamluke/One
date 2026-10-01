import type { AssetClass, HoldingKind } from '../lib/types';

/**
 * A small, hand-curated catalog of securities that students commonly ask about.
 *
 * Exposures and expense ratios are rounded approximations meant for learning and
 * diversification math — not live data. Users can always add any ticker manually
 * and set its asset class / sector themselves.
 */
export interface SecurityInfo {
  symbol: string;
  name: string;
  kind: HoldingKind;
  /** Fraction of the security in each asset class (sums to 1). */
  exposure: Partial<Record<AssetClass, number>>;
  /** Fraction of the security in each sector. "Broad market" means it already spreads across all sectors. */
  sectors: Record<string, number>;
  /** Annual expense ratio as a decimal (0.0003 = 0.03%). Individual stocks have no fund fee. */
  expenseRatio: number;
  /** Roughly how many companies/bonds sit inside — helps explain why funds diversify. */
  approxHoldings: number;
  blurb: string;
}

const BROAD = { 'Broad market': 1 };

export const SECURITIES: SecurityInfo[] = [
  // ---- Broad stock index funds ----
  { symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', kind: 'etf', exposure: { usStocks: 1 }, sectors: BROAD, expenseRatio: 0.0003, approxHoldings: 3500, blurb: 'Nearly every public U.S. company in one fund.' },
  { symbol: 'ITOT', name: 'iShares Core S&P Total U.S. Stock Market ETF', kind: 'etf', exposure: { usStocks: 1 }, sectors: BROAD, expenseRatio: 0.0003, approxHoldings: 2500, blurb: 'Total U.S. market, similar to VTI.' },
  { symbol: 'SCHB', name: 'Schwab U.S. Broad Market ETF', kind: 'etf', exposure: { usStocks: 1 }, sectors: BROAD, expenseRatio: 0.0003, approxHoldings: 2400, blurb: 'Total U.S. market from Schwab.' },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', kind: 'etf', exposure: { usStocks: 1 }, sectors: BROAD, expenseRatio: 0.0003, approxHoldings: 500, blurb: '500 of the largest U.S. companies.' },
  { symbol: 'IVV', name: 'iShares Core S&P 500 ETF', kind: 'etf', exposure: { usStocks: 1 }, sectors: BROAD, expenseRatio: 0.0003, approxHoldings: 500, blurb: 'S&P 500 index fund.' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust', kind: 'etf', exposure: { usStocks: 1 }, sectors: BROAD, expenseRatio: 0.000945, approxHoldings: 500, blurb: 'The original S&P 500 ETF — a bit pricier than VOO/IVV.' },
  { symbol: 'FXAIX', name: 'Fidelity 500 Index Fund', kind: 'mutualFund', exposure: { usStocks: 1 }, sectors: BROAD, expenseRatio: 0.00015, approxHoldings: 500, blurb: 'Ultra-low-cost S&P 500 mutual fund.' },
  { symbol: 'VTV', name: 'Vanguard Value ETF', kind: 'etf', exposure: { usStocks: 1 }, sectors: BROAD, expenseRatio: 0.0004, approxHoldings: 340, blurb: 'Large U.S. "value" companies.' },
  { symbol: 'VUG', name: 'Vanguard Growth ETF', kind: 'etf', exposure: { usStocks: 1 }, sectors: { Technology: 0.5, 'Broad market': 0.5 }, expenseRatio: 0.0004, approxHoldings: 180, blurb: 'Large U.S. growth companies — tech-heavy.' },
  { symbol: 'IJH', name: 'iShares Core S&P Mid-Cap ETF', kind: 'etf', exposure: { usStocks: 1 }, sectors: BROAD, expenseRatio: 0.0005, approxHoldings: 400, blurb: 'Mid-sized U.S. companies.' },
  { symbol: 'IJR', name: 'iShares Core S&P Small-Cap ETF', kind: 'etf', exposure: { usStocks: 1 }, sectors: BROAD, expenseRatio: 0.0006, approxHoldings: 600, blurb: 'Small U.S. companies.' },
  { symbol: 'SCHD', name: 'Schwab U.S. Dividend Equity ETF', kind: 'etf', exposure: { usStocks: 1 }, sectors: BROAD, expenseRatio: 0.0006, approxHoldings: 100, blurb: '~100 dividend-paying U.S. companies.' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust (Nasdaq-100)', kind: 'etf', exposure: { usStocks: 1 }, sectors: { Technology: 0.6, 'Broad market': 0.4 }, expenseRatio: 0.002, approxHoldings: 100, blurb: '100 big Nasdaq companies — very tech-heavy.' },
  { symbol: 'XLK', name: 'Technology Select Sector SPDR', kind: 'etf', exposure: { usStocks: 1 }, sectors: { Technology: 1 }, expenseRatio: 0.0008, approxHoldings: 70, blurb: 'Only tech stocks — a sector bet.' },
  { symbol: 'SMH', name: 'VanEck Semiconductor ETF', kind: 'etf', exposure: { usStocks: 1 }, sectors: { Technology: 1 }, expenseRatio: 0.0035, approxHoldings: 25, blurb: 'Only chip makers — a narrow sector bet.' },

  // ---- Global / international ----
  { symbol: 'VT', name: 'Vanguard Total World Stock ETF', kind: 'etf', exposure: { usStocks: 0.62, intlStocks: 0.28, emStocks: 0.1 }, sectors: BROAD, expenseRatio: 0.0006, approxHoldings: 9800, blurb: 'The whole world’s stock market in one fund.' },
  { symbol: 'VXUS', name: 'Vanguard Total International Stock ETF', kind: 'etf', exposure: { intlStocks: 0.75, emStocks: 0.25 }, sectors: BROAD, expenseRatio: 0.0005, approxHoldings: 8600, blurb: 'Every major market outside the U.S.' },
  { symbol: 'IXUS', name: 'iShares Core MSCI Total International Stock ETF', kind: 'etf', exposure: { intlStocks: 0.75, emStocks: 0.25 }, sectors: BROAD, expenseRatio: 0.0007, approxHoldings: 4300, blurb: 'International stocks, developed + emerging.' },
  { symbol: 'IEFA', name: 'iShares Core MSCI EAFE ETF', kind: 'etf', exposure: { intlStocks: 1 }, sectors: BROAD, expenseRatio: 0.0007, approxHoldings: 2700, blurb: 'Developed markets: Europe, Japan, Australia…' },
  { symbol: 'VWO', name: 'Vanguard FTSE Emerging Markets ETF', kind: 'etf', exposure: { emStocks: 1 }, sectors: BROAD, expenseRatio: 0.0007, approxHoldings: 5800, blurb: 'Emerging markets like India, China, Brazil.' },

  // ---- Target-date (all-in-one) ----
  { symbol: 'VFFVX', name: 'Vanguard Target Retirement 2055 Fund', kind: 'mutualFund', exposure: { usStocks: 0.54, intlStocks: 0.27, emStocks: 0.09, bonds: 0.1 }, sectors: BROAD, expenseRatio: 0.0008, approxHoldings: 20000, blurb: 'All-in-one fund that gets safer as 2055 approaches.' },
  { symbol: 'VTTSX', name: 'Vanguard Target Retirement 2060 Fund', kind: 'mutualFund', exposure: { usStocks: 0.54, intlStocks: 0.27, emStocks: 0.09, bonds: 0.1 }, sectors: BROAD, expenseRatio: 0.0008, approxHoldings: 20000, blurb: 'All-in-one fund for retiring around 2060.' },

  // ---- Bonds & cash ----
  { symbol: 'BND', name: 'Vanguard Total Bond Market ETF', kind: 'etf', exposure: { bonds: 1 }, sectors: { Bonds: 1 }, expenseRatio: 0.0003, approxHoldings: 11000, blurb: 'Thousands of U.S. government and corporate bonds.' },
  { symbol: 'AGG', name: 'iShares Core U.S. Aggregate Bond ETF', kind: 'etf', exposure: { bonds: 1 }, sectors: { Bonds: 1 }, expenseRatio: 0.0003, approxHoldings: 12000, blurb: 'Broad U.S. bond market.' },
  { symbol: 'BNDX', name: 'Vanguard Total International Bond ETF', kind: 'etf', exposure: { bonds: 1 }, sectors: { Bonds: 1 }, expenseRatio: 0.0007, approxHoldings: 7000, blurb: 'Bonds from outside the U.S. (currency-hedged).' },
  { symbol: 'TIP', name: 'iShares TIPS Bond ETF', kind: 'etf', exposure: { bonds: 1 }, sectors: { Bonds: 1 }, expenseRatio: 0.0018, approxHoldings: 50, blurb: 'Inflation-protected U.S. Treasury bonds.' },
  { symbol: 'SGOV', name: 'iShares 0-3 Month Treasury Bond ETF', kind: 'etf', exposure: { cash: 1 }, sectors: { Cash: 1 }, expenseRatio: 0.0009, approxHoldings: 20, blurb: 'Very short Treasury bills — behaves like cash.' },
  { symbol: 'CASH', name: 'Cash / money market', kind: 'cash', exposure: { cash: 1 }, sectors: { Cash: 1 }, expenseRatio: 0, approxHoldings: 1, blurb: 'Uninvested cash in your brokerage account.' },

  // ---- Real assets ----
  { symbol: 'VNQ', name: 'Vanguard Real Estate ETF', kind: 'etf', exposure: { realEstate: 1 }, sectors: { 'Real Estate': 1 }, expenseRatio: 0.0013, approxHoldings: 160, blurb: 'Real estate investment trusts (REITs).' },
  { symbol: 'GLD', name: 'SPDR Gold Shares', kind: 'etf', exposure: { commodities: 1 }, sectors: { Commodities: 1 }, expenseRatio: 0.004, approxHoldings: 1, blurb: 'Tracks the price of gold.' },

  // ---- Individual stocks students often own ----
  { symbol: 'AAPL', name: 'Apple', kind: 'stock', exposure: { usStocks: 1 }, sectors: { Technology: 1 }, expenseRatio: 0, approxHoldings: 1, blurb: 'One company: iPhone, Mac, services.' },
  { symbol: 'MSFT', name: 'Microsoft', kind: 'stock', exposure: { usStocks: 1 }, sectors: { Technology: 1 }, expenseRatio: 0, approxHoldings: 1, blurb: 'One company: software & cloud.' },
  { symbol: 'NVDA', name: 'NVIDIA', kind: 'stock', exposure: { usStocks: 1 }, sectors: { Technology: 1 }, expenseRatio: 0, approxHoldings: 1, blurb: 'One company: AI & graphics chips.' },
  { symbol: 'GOOGL', name: 'Alphabet (Google)', kind: 'stock', exposure: { usStocks: 1 }, sectors: { Communication: 1 }, expenseRatio: 0, approxHoldings: 1, blurb: 'One company: search, YouTube, cloud.' },
  { symbol: 'META', name: 'Meta Platforms', kind: 'stock', exposure: { usStocks: 1 }, sectors: { Communication: 1 }, expenseRatio: 0, approxHoldings: 1, blurb: 'One company: Instagram, Facebook, WhatsApp.' },
  { symbol: 'AMZN', name: 'Amazon', kind: 'stock', exposure: { usStocks: 1 }, sectors: { 'Consumer Discretionary': 1 }, expenseRatio: 0, approxHoldings: 1, blurb: 'One company: e-commerce & AWS.' },
  { symbol: 'TSLA', name: 'Tesla', kind: 'stock', exposure: { usStocks: 1 }, sectors: { 'Consumer Discretionary': 1 }, expenseRatio: 0, approxHoldings: 1, blurb: 'One company: electric vehicles & energy.' },
  { symbol: 'NKE', name: 'Nike', kind: 'stock', exposure: { usStocks: 1 }, sectors: { 'Consumer Discretionary': 1 }, expenseRatio: 0, approxHoldings: 1, blurb: 'One company: athletic apparel.' },
  { symbol: 'SBUX', name: 'Starbucks', kind: 'stock', exposure: { usStocks: 1 }, sectors: { 'Consumer Discretionary': 1 }, expenseRatio: 0, approxHoldings: 1, blurb: 'One company: coffee shops.' },
  { symbol: 'DIS', name: 'Walt Disney', kind: 'stock', exposure: { usStocks: 1 }, sectors: { Communication: 1 }, expenseRatio: 0, approxHoldings: 1, blurb: 'One company: parks, movies, streaming.' },
  { symbol: 'COST', name: 'Costco', kind: 'stock', exposure: { usStocks: 1 }, sectors: { 'Consumer Staples': 1 }, expenseRatio: 0, approxHoldings: 1, blurb: 'One company: warehouse retail.' },
  { symbol: 'WMT', name: 'Walmart', kind: 'stock', exposure: { usStocks: 1 }, sectors: { 'Consumer Staples': 1 }, expenseRatio: 0, approxHoldings: 1, blurb: 'One company: retail.' },
  { symbol: 'KO', name: 'Coca-Cola', kind: 'stock', exposure: { usStocks: 1 }, sectors: { 'Consumer Staples': 1 }, expenseRatio: 0, approxHoldings: 1, blurb: 'One company: beverages.' },
  { symbol: 'JPM', name: 'JPMorgan Chase', kind: 'stock', exposure: { usStocks: 1 }, sectors: { Financials: 1 }, expenseRatio: 0, approxHoldings: 1, blurb: 'One company: banking.' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', kind: 'stock', exposure: { usStocks: 1 }, sectors: { 'Health Care': 1 }, expenseRatio: 0, approxHoldings: 1, blurb: 'One company: health care products.' },
  { symbol: 'XOM', name: 'Exxon Mobil', kind: 'stock', exposure: { usStocks: 1 }, sectors: { Energy: 1 }, expenseRatio: 0, approxHoldings: 1, blurb: 'One company: oil & gas.' },

  // ---- Crypto ----
  { symbol: 'BTC', name: 'Bitcoin', kind: 'crypto', exposure: { crypto: 1 }, sectors: { Crypto: 1 }, expenseRatio: 0, approxHoldings: 1, blurb: 'Highly volatile digital asset.' },
  { symbol: 'ETH', name: 'Ethereum', kind: 'crypto', exposure: { crypto: 1 }, sectors: { Crypto: 1 }, expenseRatio: 0, approxHoldings: 1, blurb: 'Highly volatile digital asset.' },
];

const BY_SYMBOL = new Map(SECURITIES.map((s) => [s.symbol, s]));

export function findSecurity(symbol: string): SecurityInfo | undefined {
  return BY_SYMBOL.get(symbol.trim().toUpperCase());
}

export function searchSecurities(query: string, limit = 8): SecurityInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return SECURITIES.filter(
    (s) => s.symbol.toLowerCase().startsWith(q) || s.name.toLowerCase().includes(q),
  ).slice(0, limit);
}
