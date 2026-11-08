import { useReducedMotion } from 'framer-motion';

/** Semicircle gauge with an easing needle. Hand-written SVG. */
export function RiskGauge({ value, min, max, label, category, provisional, bands }: {
  value: number | null; min: number; max: number; label: string; category: string; provisional?: boolean; bands: { max: number; label: string }[];
}) {
  const reduced = useReducedMotion();
  const w = 200;
  const h = 118;
  const cx = w / 2;
  const cy = 100;
  const r = 80;
  const frac = value == null ? 0 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  const angle = -90 + frac * 180;
  const arc = (a0: number, a1: number, rr: number) => {
    const p = (a: number) => [cx + rr * Math.cos((Math.PI * (a - 180)) / 180), cy + rr * Math.sin((Math.PI * (a - 180)) / 180)];
    const [x0, y0] = p(a0);
    const [x1, y1] = p(a1);
    return `M ${x0} ${y0} A ${rr} ${rr} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  let prev = min;
  const segs = bands.map((b, i) => {
    const a0 = ((prev - min) / (max - min)) * 180;
    const a1 = ((Math.min(b.max, max) + (i === bands.length - 1 ? 0 : 1) - min) / (max - min)) * 180;
    prev = b.max + 1;
    return { a0, a1: Math.min(180, a1), label: b.label, i };
  });
  const shades = ['#D9C9AD', '#B59B73', '#AFC8BA', '#7FA592'];
  return (
    <div className="flex flex-col items-center">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${label}: ${value == null ? 'not scored' : `${value} of ${max}`}, ${category}`}>
        {segs.map((s) => (
          <path key={s.i} d={arc(s.a0, s.a1, r)} fill="none" stroke={shades[s.i % shades.length]} strokeWidth={14} strokeLinecap="butt" />
        ))}
        <path d={arc(0, 180, r)} fill="none" stroke="#1A1A1A" strokeWidth={1} opacity={0.15} />
        <text x={cx - r} y={cy + 14} fontSize="10" fill="#6B6B6B" fontFamily="IBM Plex Mono" textAnchor="middle">{min}</text>
        <text x={cx + r} y={cy + 14} fontSize="10" fill="#6B6B6B" fontFamily="IBM Plex Mono" textAnchor="middle">{max}</text>
        <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: reduced ? 'none' : 'transform 600ms cubic-bezier(0.22, 1, 0.36, 1)' }}>
          <line x1={cx} y1={cy} x2={cx} y2={cy - r + 4} stroke={value == null ? '#9C9C9C' : '#1A1A1A'} strokeWidth={2} strokeLinecap="round" />
        </g>
        <circle cx={cx} cy={cy} r={5} fill="#1A1A1A" />
        <text x={cx} y={cy - 24} textAnchor="middle" fontSize="22" fontWeight={500} fill="#1A1A1A" fontFamily="IBM Plex Mono">{value ?? '—'}</text>
      </svg>
      <div className="label-caps">{label}</div>
      <div className={`text-sm font-medium ${provisional ? 'text-warn' : 'text-ink'}`}>{category}</div>
    </div>
  );
}
