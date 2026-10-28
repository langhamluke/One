export const fmtUSD = (n: number, opts: { compact?: boolean; decimals?: number } = {}): string => {
  if (!Number.isFinite(n)) return '—';
  const neg = n < 0;
  const a = Math.abs(n);
  let s: string;
  if (opts.compact && a >= 1_000_000) s = `$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M`;
  else if (opts.compact && a >= 10_000) s = `$${Math.round(a / 1000)}k`;
  else if (opts.compact && a >= 1_000) s = `$${(a / 1000).toFixed(1)}k`;
  else s = `$${a.toLocaleString('en-US', { maximumFractionDigits: opts.decimals ?? 0, minimumFractionDigits: opts.decimals ?? 0 })}`;
  return neg ? `−${s}` : s;
};

export const fmtK = (n: number) => fmtUSD(n, { compact: true });
export const fmtPct = (n: number, d = 0) => `${(n * 100).toFixed(d)}%`;
export const fmtRate = (n: number) => `$${n.toFixed(2)}`;
export const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  if (!m) return y;
  return d ? `${m}/${d}/${y}` : `${m}/${y}`;
};
