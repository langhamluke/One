import { motion, useReducedMotion } from 'framer-motion';
import { fmtK } from '../lib/format';
import type { Waypoint } from '../lib/payroll';

export interface Route { id: string; label: string; sub?: string; waypoints: Waypoint[]; active: boolean; conv: (w: Waypoint) => number }

/**
 * Navigation-display style career map: one route per path, waypoints at career events.
 * Active route drawn in magenta (the flight plan); alternates in white.
 */
export function RouteMap({ routes, startAge, endAge, onSelect }: { routes: Route[]; startAge: number; endAge: number; onSelect?: (id: string) => void }) {
  const reduce = useReducedMotion();
  const W = 1000;
  const rowH = 138;
  const padL = 250, padR = 40, top = 34;
  const H = top + routes.length * rowH + 12;
  const x = (age: number) => padL + ((age - startAge) / Math.max(1, endAge - startAge)) * (W - padL - padR);
  const ticks: number[] = [];
  for (let a = Math.ceil(startAge / 5) * 5; a <= endAge; a += 5) ticks.push(a);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Career route map">
      {/* range scale */}
      {ticks.map((a) => (
        <g key={a}>
          <line x1={x(a)} y1={top - 10} x2={x(a)} y2={H - 8} stroke="#1B2533" strokeWidth="1" />
          <text x={x(a)} y={top - 16} fill="#8A99AD" fontSize="11" textAnchor="middle" fontFamily="B612 Mono">{a}</text>
        </g>
      ))}
      <text x={padL - 12} y={top - 16} fill="#8A99AD" fontSize="10" textAnchor="end" letterSpacing="1.5">AGE</text>

      {routes.map((r, i) => {
        const y = top + i * rowH + rowH / 2;
        const color = r.active ? '#FF4FD8' : '#E6EDF5';
        const pts = r.waypoints;
        const d = pts.map((w, k) => `${k === 0 ? 'M' : 'L'} ${x(w.age)} ${y}`).join(' ');
        return (
          <g key={r.id} className={onSelect ? 'cursor-pointer' : ''} onClick={() => onSelect?.(r.id)}
            role={onSelect ? 'button' : undefined} tabIndex={onSelect ? 0 : undefined} aria-label={onSelect ? `Make ${r.label} the active flight plan` : undefined}
            onKeyDown={(e) => { if (onSelect && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(r.id); } }}>
            <rect x="0" y={y - rowH / 2 + 4} width={W} height={rowH - 8} fill={r.active ? 'rgba(255,79,216,0.04)' : 'transparent'} rx="4" />
            <text x="12" y={y - 10} fill={r.active ? '#FF4FD8' : '#E6EDF5'} fontSize="15" fontWeight="700" fontFamily="B612 Mono">{r.label}</text>
            {r.sub && <text x="12" y={y + 6} fill="#8A99AD" fontSize="10">{r.sub.length > 36 ? r.sub.slice(0, 35) + '…' : r.sub}</text>}
            <text x="12" y={y + 21} fill={r.active ? '#FF4FD8' : '#8A99AD'} fontSize="9.5" letterSpacing="1.4">{r.active ? 'ACTIVE FLIGHT PLAN' : 'ALTERNATE'}</text>
            <motion.path d={d} fill="none" stroke={color} strokeWidth={r.active ? 2.5 : 1.5} strokeOpacity={r.active ? 1 : 0.55}
              initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, ease: 'easeOut' }} />
            {layoutLabels(pts, x).map(({ w, lane }, k) => {
              const cx = x(w.age);
              const isEnd = w.kind === 'end';
              const [ly, sy] = LANES[lane];
              return (
                <g key={`${w.label}-${k}`}>
                  {lane > 1 && <line x1={cx} y1={y + (ly < 0 ? -9 : 9)} x2={cx} y2={y + (ly < 0 ? ly + 4 : ly - 11)} stroke="#243042" strokeWidth="1" />}
                  {isEnd ? (
                    <circle cx={cx} cy={y} r="6" fill="#0B0F14" stroke={color} strokeWidth="2" />
                  ) : (
                    <path d={`M ${cx} ${y - 7} L ${cx + 2} ${y - 2} L ${cx + 7} ${y} L ${cx + 2} ${y + 2} L ${cx} ${y + 7} L ${cx - 2} ${y + 2} L ${cx - 7} ${y} L ${cx - 2} ${y - 2} Z`}
                      fill={r.active ? '#FF4FD8' : '#0B0F14'} stroke={color} strokeWidth="1.3" />
                  )}
                  <text x={cx} y={y + ly} fill={r.active ? '#fff' : '#C9D4E2'} fontSize="10.5" fontWeight="700" textAnchor="middle" letterSpacing="0.6">{w.label}</text>
                  <text x={cx} y={y + sy} fill="#8A99AD" fontSize="9.5" textAnchor="middle" fontFamily="B612 Mono">
                    {w.year}{!isEnd && w.pay > 0 ? ` · ${fmtK(r.conv(w))}` : ''}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

/** Label lanes: [labelOffsetY, subOffsetY] relative to the route line. */
const LANES: [number, number][] = [[-14, -26], [22, 34], [-42, -54], [50, 62]];

/** Greedy lane assignment so neighbouring waypoint labels never overlap. */
function layoutLabels(pts: Waypoint[], x: (age: number) => number) {
  const lastRight = LANES.map(() => -Infinity);
  return pts.map((w) => {
    const width = Math.max(w.label.length * 7, 74);
    const left = x(w.age) - width / 2;
    let lane = lastRight.findIndex((r) => r + 6 < left);
    if (lane === -1) lane = lastRight.indexOf(Math.min(...lastRight));
    lastRight[lane] = left + width;
    return { w, lane };
  });
}
