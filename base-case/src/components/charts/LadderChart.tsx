import type { PathResult } from '@shared/lib/derived';
import { fmtCompact } from '@/lib/format';
import { pathColor, useWidth } from './common';

interface Label { x: number; text: string; width: number; lane: number }

/** Greedy lane assignment: labels sorted by x take the first lane whose last label ends before their start. */
function assignLanes(items: { x: number; text: string }[], maxLanes = 3): Label[] {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const laneEnd: number[] = [];
  const out: Label[] = [];
  for (const it of sorted) {
    const width = it.text.length * 6.2 + 8;
    let lane = laneEnd.findIndex((end) => end <= it.x - 4);
    if (lane === -1) {
      if (laneEnd.length < maxLanes) lane = laneEnd.length;
      else lane = -1;
    }
    if (lane === -1) {
      out.push({ x: it.x, text: it.text, width, lane: -1 });
      continue;
    }
    laneEnd[lane] = it.x + width;
    out.push({ x: it.x, text: it.text, width, lane });
  }
  return out;
}

/** Career ladder comparison: one horizontal timeline lane per path, rungs at promotions, ages on the x axis. */
export function LadderChart({ paths, activeId, startAge, retirementAge, lifeAge }: { paths: PathResult[]; activeId: string; startAge: number; retirementAge: number; lifeAge?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const w = Math.max(320, width);
  const padL = 12;
  const padR = 16;
  const laneH = 78;
  const top = 10;
  const endAge = Math.max(retirementAge + 1, ...paths.map((p) => Math.max(...p.waypoints.map((wp) => wp.age), startAge)));
  const x = (age: number) => padL + ((age - startAge) / Math.max(1, endAge - startAge)) * (w - padL - padR);
  const h = top + laneH * paths.length + 26;
  const ticks: number[] = [];
  for (let a = Math.ceil(startAge / 5) * 5; a <= endAge; a += 5) ticks.push(a);
  return (
    <div ref={ref} className="w-full min-w-0">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block max-w-full" aria-hidden>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={top} y2={h - 22} stroke="#DEDEDE" />
            <text x={x(t)} y={h - 8} textAnchor="middle" fontSize="10" fill="#6B6B6B" fontFamily="IBM Plex Mono">{t}</text>
          </g>
        ))}
        <line x1={x(retirementAge)} x2={x(retirementAge)} y1={top} y2={h - 22} stroke="#174D38" strokeDasharray="3 3" />
        <text x={Math.min(x(retirementAge), w - padR - 2)} y={top + 2} textAnchor={x(retirementAge) > w - 60 ? 'end' : 'middle'} fontSize="9" fill="#174D38" fontFamily="IBM Plex Mono">retire {retirementAge}</text>
        {paths.map((p, pi) => {
          const active = p.pathId === activeId;
          const color = pathColor(pi, active);
          const y = top + laneH * pi + 58;
          const rungs = p.waypoints.filter((wp) => wp.kind !== 'retire');
          const labels = assignLanes(rungs.map((r) => ({ x: x(r.age), text: `${r.label} · ${fmtCompact(r.pay)}` })));
          const lastAge = Math.min(endAge, retirementAge);
          return (
            <g key={p.pathId}>
              <text x={padL} y={y - 46} fontSize="11" fontWeight={600} fill={color}>{p.name}{active ? ' (active)' : ''}</text>
              <line x1={x(startAge)} x2={x(lastAge)} y1={y} y2={y} stroke={color} strokeWidth={active ? 3 : 2} strokeLinecap="round" opacity={active ? 1 : 0.7} />
              {rungs.map((r, i) => (
                <g key={i}>
                  <rect x={x(r.age) - 4} y={y - 4} width={8} height={8} fill={r.kind === 'gap' ? '#4D1717' : r.kind === 'school' ? '#B5740A' : color} stroke="#fff" strokeWidth={1.5} />
                  <title>{`${r.label} at ${r.age}: ${fmtCompact(r.pay)}`}</title>
                </g>
              ))}
              {labels.map((l, i) =>
                l.lane < 0 ? null : (
                  <text key={i} x={Math.min(l.x, w - padR - l.width)} y={y - 10 - l.lane * 11} fontSize="9.5" fill="#3D3D3D" fontFamily="IBM Plex Mono">{l.text}</text>
                ),
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
