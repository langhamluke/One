import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { GlidePoint } from '@shared/lib/derived';
import { fmtPct } from '@/lib/format';
import { ChartFrame, REC, tooltipStyle, useAnim } from './common';

export function GlideChart({ glidePath, retirementAge, height = 160, frame = true }: { glidePath: GlidePoint[]; retirementAge: number; height?: number; frame?: boolean }) {
  const anim = useAnim();
  const data = glidePath.map((g) => ({ age: g.age, equity: Math.round(g.equity * 1000) / 10 }));
  const chart = (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#E9E7E1" vertical={false} />
          <XAxis dataKey="age" tickLine={false} axisLine={{ stroke: '#DAD7CF' }} />
          <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tickLine={false} axisLine={false} width={40} />
          <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v}%`, 'Equity']} labelFormatter={(l) => `Age ${l}`} />
          <ReferenceLine x={retirementAge} stroke={REC} strokeDasharray="3 3" />
          <Area type="stepAfter" dataKey="equity" stroke={REC} strokeWidth={2} fill={REC} fillOpacity={0.12} isAnimationActive={anim} animationDuration={500} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
  if (!frame) return chart;
  return (
    <ChartFrame description="Glide path: equity share of the portfolio by age" columns={[{ key: 'age', label: 'Age', numeric: true }, { key: 'equity', label: 'Equity', numeric: true }]} rows={glidePath.filter((_, i) => i % 5 === 0 || i === glidePath.length - 1).map((g) => ({ age: g.age, equity: fmtPct(g.equity, 0) }))}>
      {chart}
    </ChartFrame>
  );
}
