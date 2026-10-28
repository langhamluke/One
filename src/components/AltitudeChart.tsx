import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtK } from '../lib/format';
import { CHART_ANIM } from './assetColors';

export interface AltPoint { age: number; p10: number; p50: number; p90: number; band: [number, number] }

const axisTick = { fill: '#8A99AD', fontSize: 11, fontFamily: 'B612 Mono' };

function TapeTooltip({ active, payload }: { active?: boolean; payload?: { payload: AltPoint }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="num rounded border border-edge bg-[#080B10]/95 px-3 py-2 text-[12px] shadow-lg">
      <div className="mb-1 text-dim">AGE {d.age}</div>
      <div className="text-white">P90 {fmtK(d.p90)}</div>
      <div className="text-plan">P50 {fmtK(d.p50)}</div>
      <div className="text-white">P10 {fmtK(d.p10)}</div>
    </div>
  );
}

/**
 * Altitude-tape projection: Monte Carlo cone (P10–P90 shaded), median in magenta,
 * right-hand value tape with a boxed readout at the landing age.
 */
export function AltitudeChart({ data, retireAge, target, waypoints = [], height = 380, compact = false }: {
  data: AltPoint[]; retireAge: number; target?: number; waypoints?: { age: number; label: string }[]; height?: number; compact?: boolean;
}) {
  const atRet = data.find((d) => d.age === retireAge) ?? data[data.length - 1];
  const maxY = Math.max(...data.map((d) => d.p90), target ?? 0) * 1.08;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: compact ? 8 : 24, right: compact ? 8 : 4, bottom: 4, left: compact ? 0 : 8 }}>
          <defs>
            <linearGradient id="cone" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FF4FD8" stopOpacity={0.24} />
              <stop offset="100%" stopColor="#FF4FD8" stopOpacity={0.08} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1B2533" vertical={false} />
          <XAxis dataKey="age" type="number" domain={['dataMin', 'dataMax']} tick={axisTick} tickLine={false} axisLine={{ stroke: '#243042' }} tickCount={10} allowDecimals={false} />
          <YAxis orientation="right" tick={axisTick} tickFormatter={(v) => fmtK(v)} width={compact ? 48 : 64} domain={[0, maxY]} axisLine={{ stroke: '#243042' }} tickLine={{ stroke: '#243042' }} />
          {!compact && <Tooltip content={<TapeTooltip />} cursor={{ stroke: '#4FD1FF', strokeDasharray: '3 3' }} />}
          <Area type="monotone" dataKey="band" stroke="none" fill="url(#cone)" isAnimationActive={!compact && CHART_ANIM} animationDuration={900} />
          <Line type="monotone" dataKey="p90" stroke="#C9D4E2" strokeWidth={1} strokeDasharray="3 4" dot={false} isAnimationActive={!compact && CHART_ANIM} animationDuration={900} />
          <Line type="monotone" dataKey="p10" stroke="#C9D4E2" strokeWidth={1} strokeDasharray="3 4" dot={false} isAnimationActive={!compact && CHART_ANIM} animationDuration={900} />
          <Line type="monotone" dataKey="p50" stroke="#FF4FD8" strokeWidth={2.5} dot={false} isAnimationActive={!compact && CHART_ANIM} animationDuration={900} />
          {!compact && waypoints.map((w) => (
            <ReferenceLine key={`${w.label}-${w.age}`} x={w.age} stroke="#243042" strokeDasharray="2 4"
              label={{ value: w.label, position: 'insideTopLeft', fill: '#8A99AD', fontSize: 9, fontFamily: 'B612' }} />
          ))}
          <ReferenceLine x={retireAge} stroke="#8A99AD" strokeWidth={1} />
          {target !== undefined && target > 0 && (
            <ReferenceLine y={target} stroke="#FF4FD8" strokeDasharray="6 4" strokeOpacity={0.8}
              label={compact ? undefined : { value: `REQUIRED ${fmtK(target)}`, position: 'insideTopLeft', fill: '#FF4FD8', fontSize: 10, fontFamily: 'B612 Mono' }} />
          )}
          {atRet && (
            <ReferenceDot x={atRet.age} y={atRet.p50} r={4} fill="#FF4FD8" stroke="#0B0F14" strokeWidth={2}
              label={compact ? undefined : <AltReadout value={atRet.p50} />} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function AltReadout({ value, viewBox }: { value: number; viewBox?: { x: number; y: number } }) {
  if (!viewBox) return null;
  const text = fmtK(value);
  const w = 14 + text.length * 8.6;
  const x = viewBox.x - w - 10, y = viewBox.y - 13;
  return (
    <g>
      <path d={`M ${x} ${y} h ${w} l 8 13 l -8 13 h ${-w} z`} fill="#080B10" stroke="#FF4FD8" strokeWidth="1.5" />
      <text x={x + 7} y={y + 17.5} fill="#FF4FD8" fontSize="14" fontFamily="B612 Mono">{text}</text>
    </g>
  );
}
