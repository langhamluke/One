import { fmtCompact, fmtMoney } from '@/lib/format';
import { useWidth } from './common';

/** Q5: five horizontal outcome bars [best, likelyHigh, likelyLow, worst] × amount. Hand-written SVG. */
export function RangeChart({ amount, ranges, selected, onSelect }: { amount: number; ranges: number[][]; selected: number | null; onSelect: (i: number) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const w = Math.max(280, width);
  const rowH = 34;
  const padL = 112;
  const padR = 60;
  const h = rowH * ranges.length + 28;
  const vals = ranges.map((r) => r.map((m) => m * amount));
  const lo = Math.min(...vals.map((v) => v[3]));
  const hi = Math.max(...vals.map((v) => v[0]));
  const x = (v: number) => padL + ((v - lo) / (hi - lo || 1)) * (w - padL - padR);
  const xAmt = x(amount);
  return (
    <div ref={ref} className="w-full min-w-0">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block max-w-full" aria-hidden>
        <line x1={xAmt} x2={xAmt} y1={4} y2={h - 22} stroke="#9C9C9C" strokeDasharray="3 3" />
        <text x={xAmt} y={h - 8} textAnchor="middle" fontSize="10" fill="#6B6B6B" fontFamily="IBM Plex Mono">start {fmtCompact(amount)}</text>
        {vals.map((v, i) => {
          const y = 8 + i * rowH;
          const sel = selected === i;
          const [best, lh, ll, worst] = v;
          const base = sel ? '#174D38' : '#9C9C9C';
          return (
            <g key={i} role="button" tabIndex={0} aria-label={`Range ${i + 1}: best ${fmtMoney(best)}, likely ${fmtMoney(ll)} to ${fmtMoney(lh)}, worst ${fmtMoney(worst)}`} className="cursor-pointer focus:outline-none" onClick={() => onSelect(i)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(i); } }}>
              <rect x={0} y={y - 4} width={w} height={rowH} fill={sel ? '#E3EDE7' : 'transparent'} rx={4} />
              <text x={padL - 52} y={y + 14} textAnchor="end" fontSize="11" fill={sel ? '#174D38' : '#3D3D3D'} fontWeight={sel ? 600 : 500}>Range {i + 1}</text>
              <rect x={x(worst)} y={y + 6} width={Math.max(2, x(best) - x(worst))} height={10} rx={2} fill={base} opacity={0.25} />
              <rect x={x(ll)} y={y + 4} width={Math.max(2, x(lh) - x(ll))} height={14} rx={2} fill={base} />
              <text x={x(worst) - 4} y={y + 14} textAnchor="end" fontSize="10" fill="#4D1717" fontFamily="IBM Plex Mono">{fmtCompact(worst)}</text>
              <text x={x(best) + 4} y={y + 14} textAnchor="start" fontSize="10" fill="#2B7A4B" fontFamily="IBM Plex Mono">{fmtCompact(best)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
