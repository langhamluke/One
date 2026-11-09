import { useReducedMotion } from 'framer-motion';

/**
 * The original Flight Plan's attitude indicator: sky over ground, the horizon banks with the risk score
 * (conservative = left wing down, aggressive = right wing down) and pitches with the time horizon.
 * Decorative summary of the questionnaire; the numbers sit beside it.
 */
export function AttitudeIndicator({ risk, horizon, size = 180 }: { risk: number | null; horizon: number | null; size?: number }) {
  const reduced = useReducedMotion();
  const bank = risk == null ? 0 : ((risk - 17) / 11) * 25; // -25° (6) … +25° (28)
  const pitch = horizon == null ? 0 : ((horizon - 12) / 8) * 18; // px shift
  const r = size / 2;
  const id = `att-${Math.round(size)}`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Attitude indicator: risk ${risk ?? 'not scored'} of 28, horizon ${horizon ?? 'not scored'} of 20`}>
      <defs>
        <clipPath id={id}><rect x={0} y={0} width={size} height={size} rx={size * 0.12} /></clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <g style={{ transform: `rotate(${bank}deg)`, transformOrigin: `${r}px ${r}px`, transition: reduced ? 'none' : 'transform 600ms cubic-bezier(0.22, 1, 0.36, 1)' }}>
          <rect x={-size} y={-size} width={size * 3} height={size + r + pitch} fill="#2E5FA3" />
          <rect x={-size} y={r + pitch} width={size * 3} height={size * 2} fill="#6B4A2B" />
          <line x1={-size} x2={size * 2} y1={r + pitch} y2={r + pitch} stroke="#fff" strokeWidth={1.5} />
          {[-2, -1, 1, 2].map((k) => (
            <g key={k}>
              <line x1={r - (Math.abs(k) === 2 ? 22 : 12)} x2={r + (Math.abs(k) === 2 ? 22 : 12)} y1={r + pitch + k * 18} y2={r + pitch + k * 18} stroke="#fff" strokeWidth={1} opacity={0.85} />
              {Math.abs(k) === 2 && <text x={r - 30} y={r + pitch + k * 18 + 3} fontSize={8} fill="#fff" textAnchor="end" fontFamily="var(--font-mono)">{k < 0 ? 20 : 20}</text>}
            </g>
          ))}
        </g>
        {/* fixed aircraft symbol */}
        <g stroke="#FF4FD8" strokeWidth={2.5} strokeLinecap="round">
          <line x1={r - 34} x2={r - 10} y1={r} y2={r} />
          <line x1={r + 10} x2={r + 34} y1={r} y2={r} />
          <rect x={r - 3} y={r - 3} width={6} height={6} fill="#FF4FD8" stroke="none" />
        </g>
        {/* bank scale */}
        {[-30, -20, -10, 0, 10, 20, 30].map((a) => {
          const rad = ((a - 90) * Math.PI) / 180;
          const inner = r - 8;
          const outer = a === 0 ? r : r - 4;
          return <line key={a} x1={r + Math.cos(rad) * inner} y1={r + Math.sin(rad) * inner} x2={r + Math.cos(rad) * outer} y2={r + Math.sin(rad) * outer} stroke="#fff" strokeWidth={a === 0 ? 2 : 1} />;
        })}
        <polygon points={`${r},${8} ${r - 5},${18} ${r + 5},${18}`} fill="#FF4FD8" style={{ transform: `rotate(${bank}deg)`, transformOrigin: `${r}px ${r}px`, transition: reduced ? 'none' : 'transform 600ms cubic-bezier(0.22, 1, 0.36, 1)' }} />
      </g>
      <rect x={0.5} y={0.5} width={size - 1} height={size - 1} rx={size * 0.12} fill="none" stroke="rgb(var(--c-line))" />
    </svg>
  );
}
