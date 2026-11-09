import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MonteCarloResult } from '@shared/lib/derived';
import type { DollarBasis } from '@shared/lib/types';
import { fmtCompact, fmtMoney, toBasis } from '@/lib/format';
import { ChartFrame, theme, tooltipStyle, useAnim } from './common';

function RetireLabel({ viewBox, text }: { viewBox?: { x?: number; y?: number }; text: string }) {
  const x = (viewBox?.x ?? 0) + 6;
  const y = (viewBox?.y ?? 0) + 8;
  const w = text.length * 7 + 12;
  return (
    <g>
      <rect x={x} y={y} width={w} height={20} rx={4} fill={theme.paper2} stroke={theme.rec} />
      <text x={x + 6} y={y + 14} fontSize="11" fontFamily={theme.mono} fill={theme.rec}>{text}</text>
    </g>
  );
}

export function ScenarioCone({ mc, basis, inflation, height = 300, compact = false }: { mc: MonteCarloResult; basis: DollarBasis; inflation: number; height?: number; compact?: boolean }) {
  const anim = useAnim();
  const real = basis === 'today';
  const data = mc.ages.map((age, i) => ({
    age,
    p10: Math.round(real ? mc.p10Real[i] : mc.p10[i]),
    p50: Math.round(real ? mc.p50Real[i] : mc.p50[i]),
    p90: Math.round(real ? mc.p90Real[i] : mc.p90[i]),
    band: [Math.round(real ? mc.p10Real[i] : mc.p10[i]), Math.round(real ? mc.p90Real[i] : mc.p90[i])],
    det: Math.round(toBasis(mc.deterministic[i] ?? 0, i, inflation, basis)),
  }));
  const atRet = data.find((d) => d.age === mc.retirementAge);
  const chart = (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={theme.grid} vertical={false} />
          <XAxis dataKey="age" tickLine={false} axisLine={{ stroke: theme.axis }} />
          <YAxis tickFormatter={(v: number) => fmtCompact(v)} tickLine={false} axisLine={false} width={56} />
          <Tooltip {...tooltipStyle()} formatter={(v: number | number[], name: string) => (Array.isArray(v) ? [`${fmtMoney(v[0])} – ${fmtMoney(v[1])}`, name] : [fmtMoney(v), name])} labelFormatter={(l) => `Age ${l}`} />
          {!compact && <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />}
          <Area type="monotone" dataKey="band" name="P10–P90" stroke="none" fill={theme.rec} fillOpacity={0.12} isAnimationActive={anim} animationDuration={600} />
          <Line type="monotone" dataKey="p50" name="P50 (median)" stroke={theme.rec} strokeWidth={2} dot={false} isAnimationActive={anim} animationDuration={600} />
          <Line type="monotone" dataKey="det" name="Deterministic" stroke={theme.ink4} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={anim} animationDuration={600} />
          <ReferenceLine x={mc.retirementAge} stroke={theme.rec} strokeDasharray="3 3" label={atRet ? <RetireLabel text={`P50 at ${mc.retirementAge}: ${fmtCompact(atRet.p50)}`} /> : undefined} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
  if (compact) return chart;
  return (
    <ChartFrame
      description={`Portfolio projection cone (P10 to P90, median and deterministic) by age in ${real ? "today's" : 'nominal'} dollars`}
      columns={[{ key: 'age', label: 'Age', numeric: true }, { key: 'p10', label: 'P10', numeric: true }, { key: 'p50', label: 'P50', numeric: true }, { key: 'p90', label: 'P90', numeric: true }, { key: 'det', label: 'Deterministic', numeric: true }]}
      rows={data.filter((_, i) => i % 5 === 0 || data[i].age === mc.retirementAge).map((d) => ({ age: d.age, p10: fmtMoney(d.p10), p50: fmtMoney(d.p50), p90: fmtMoney(d.p90), det: fmtMoney(d.det) }))}
    >
      {chart}
    </ChartFrame>
  );
}
