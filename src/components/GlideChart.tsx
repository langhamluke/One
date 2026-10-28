import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ASSET_CLASSES } from '../data/models';
import type { GlidePoint } from '../lib/glidepath';
import { ASSET_COLORS, ASSET_COLORS_PRINT, CHART_ANIM } from './assetColors';

const tick = { fill: '#8A99AD', fontSize: 11, fontFamily: 'B612 Mono' };

function GlideTip({ active, payload, label }: { active?: boolean; payload?: { payload: GlidePoint }[]; label?: number }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="num rounded border border-edge bg-[#080B10]/95 px-3 py-2 text-[12px]">
      <div className="mb-1 text-dim">AGE {label} · EQUITY <span className="text-white">{p.equity.toFixed(0)}%</span></div>
      {[...ASSET_CLASSES].reverse().map((a) => (
        <div key={a.id} className="flex justify-between gap-4"><span style={{ color: ASSET_COLORS[a.id] }}>{a.short}</span><span>{p[a.id].toFixed(1)}%</span></div>
      ))}
    </div>
  );
}

export function GlideChart({ data, retireAge, waypoints = [], height = 300, print = false, landing }: {
  data: GlidePoint[]; retireAge: number; waypoints?: { age: number; label: string }[]; height?: number; print?: boolean; landing?: number;
}) {
  const colors = print ? ASSET_COLORS_PRINT : ASSET_COLORS;
  const t = print ? { ...tick, fill: '#444', fontSize: 9 } : tick;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: print ? 4 : 22, right: 8, left: print ? -18 : -8, bottom: 0 }}>
          <CartesianGrid stroke={print ? '#ddd' : '#1B2533'} vertical={false} />
          <XAxis dataKey="age" type="number" domain={['dataMin', 'dataMax']} tick={t} tickLine={false} axisLine={{ stroke: print ? '#bbb' : '#243042' }} allowDecimals={false} tickCount={print ? 6 : 10} />
          <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={t} axisLine={false} tickLine={false} />
          {!print && <Tooltip content={<GlideTip />} cursor={{ stroke: '#4FD1FF', strokeDasharray: '3 3' }} />}
          {ASSET_CLASSES.map((a) => (
            <Area key={a.id} type="linear" dataKey={a.id} stackId="1" stroke={colors[a.id]} strokeWidth={0.5} fill={colors[a.id]} fillOpacity={print ? 0.9 : 0.85} isAnimationActive={!print && CHART_ANIM} animationDuration={800} />
          ))}
          {waypoints.map((w) => (
            <ReferenceLine key={`${w.label}-${w.age}`} x={w.age} stroke={print ? '#999' : '#0B0F14'} strokeDasharray="2 3"
              label={print ? undefined : { value: w.label, position: 'insideTopLeft', fill: '#E6EDF5', fontSize: 9, fontFamily: 'B612' }} />
          ))}
          <ReferenceLine x={retireAge} stroke="#FF4FD8" strokeWidth={1.5} />
          {landing !== undefined && <ReferenceDot x={retireAge} y={landing} r={5} fill="#FF4FD8" stroke={print ? '#fff' : '#0B0F14'} strokeWidth={2} />}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AllocationLegend({ print = false }: { print?: boolean }) {
  const colors = print ? ASSET_COLORS_PRINT : ASSET_COLORS;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
      {ASSET_CLASSES.map((a) => (
        <li key={a.id} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colors[a.id] }} />
          <span className={print ? 'text-[#333]' : 'text-dim'}>{a.label}</span>
        </li>
      ))}
    </ul>
  );
}
