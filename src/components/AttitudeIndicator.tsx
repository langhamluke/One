import { motion, useReducedMotion } from 'framer-motion';
import { HORIZON_RANGE, RISK_RANGE } from '../lib/scoring';

/**
 * PFD-style attitude indicator. Bank = risk tolerance (left = conservative, right = aggressive).
 * Pitch = time horizon (nose up = longer horizon). Purely a visual metaphor; numbers are printed beside it.
 */
export function AttitudeIndicator({ risk, horizon, size = 240, provisional = false }: { risk: number; horizon: number; size?: number; provisional?: boolean }) {
  const reduce = useReducedMotion();
  const r = Math.max(RISK_RANGE.min, Math.min(RISK_RANGE.max, risk || RISK_RANGE.min));
  const h = Math.max(HORIZON_RANGE.min, Math.min(HORIZON_RANGE.max, horizon || HORIZON_RANGE.min));
  // Map 6–28 → −30°…+30° (aircraft banks right as risk rises → horizon rotates the opposite way)
  const bank = ((r - RISK_RANGE.min) / (RISK_RANGE.max - RISK_RANGE.min)) * 60 - 30;
  // Map 4–20 → pitch 0…+20° (8px per 2.5°)
  const pitch = ((h - HORIZON_RANGE.min) / (HORIZON_RANGE.max - HORIZON_RANGE.min)) * 20;
  const pxPerDeg = 3.2;
  const c = 120;
  const transition = reduce ? { duration: 0 } : { duration: 1.1, ease: [0.22, 1, 0.36, 1] as const };

  const bankTicks = [-45, -30, -20, -10, 0, 10, 20, 30, 45];
  return (
    <svg viewBox="0 0 240 240" width={size} height={size} role="img" aria-label={`Attitude indicator: risk score ${risk}, time-horizon score ${horizon}`}>
      <defs>
        <clipPath id="ai-clip"><rect x="30" y="30" width="180" height="180" rx="22" /></clipPath>
      </defs>
      <g clipPath="url(#ai-clip)">
        <motion.g
          initial={false}
          animate={{ rotate: -bank, y: pitch * pxPerDeg }}
          transition={transition}
          style={{ originX: `${c}px`, originY: `${c}px`, transformBox: 'view-box' }}
        >
          <rect x="-120" y="-240" width="480" height="360" fill="#1A4B78" />
          <rect x="-120" y="120" width="480" height="360" fill="#5B3B1F" />
          <line x1="-120" y1="120" x2="360" y2="120" stroke="#fff" strokeWidth="1.5" />
          {[-20, -10, 10, 20, 30].map((d) => {
            const y = 120 - d * pxPerDeg;
            const w = d % 20 === 0 ? 46 : 26;
            return (
              <g key={d}>
                <line x1={c - w / 2} y1={y} x2={c + w / 2} y2={y} stroke="#fff" strokeWidth="1.2" opacity="0.9" />
                {d % 20 === 0 && (
                  <>
                    <text x={c - w / 2 - 5} y={y + 3.5} fill="#fff" fontSize="9" textAnchor="end" className="num">{Math.abs(d)}</text>
                    <text x={c + w / 2 + 5} y={y + 3.5} fill="#fff" fontSize="9" className="num">{Math.abs(d)}</text>
                  </>
                )}
              </g>
            );
          })}
        </motion.g>
      </g>
      <rect x="30" y="30" width="180" height="180" rx="22" fill="none" stroke="#243042" strokeWidth="2" />

      {/* Bank scale */}
      {bankTicks.map((d) => {
        const a = ((d - 90) * Math.PI) / 180;
        const r1 = 100, r2 = d % 30 === 0 ? 110 : 106;
        return <line key={d} x1={c + r1 * Math.cos(a)} y1={c + r1 * Math.sin(a)} x2={c + r2 * Math.cos(a)} y2={c + r2 * Math.sin(a)} stroke="#8A99AD" strokeWidth="1.5" />;
      })}
      <path d={`M ${c} ${c - 99} l -5 -8 h 10 z`} fill="#8A99AD" />
      <text x="24" y="20" fill="#8A99AD" fontSize="9" letterSpacing="1.5">CONSERVATIVE</text>
      <text x="216" y="20" fill="#8A99AD" fontSize="9" letterSpacing="1.5" textAnchor="end">AGGRESSIVE</text>

      {/* Bank pointer (rotates with score) */}
      <motion.g initial={false} animate={{ rotate: bank }} transition={transition} style={{ originX: `${c}px`, originY: `${c}px`, transformBox: 'view-box' }}>
        <path d={`M ${c} ${c - 98} l -6 10 h 12 z`} fill={provisional ? 'none' : '#FF4FD8'} stroke="#FF4FD8" strokeWidth="1.5" />
      </motion.g>

      {/* Fixed aircraft symbol */}
      <g stroke="#000" strokeWidth="1">
        <rect x={c - 62} y={c - 3} width="40" height="6" fill="#fff" />
        <rect x={c + 22} y={c - 3} width="40" height="6" fill="#fff" />
        <rect x={c - 4} y={c - 4} width="8" height="8" fill="#fff" />
      </g>
    </svg>
  );
}
