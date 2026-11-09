import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PathResult } from '@shared/lib/derived';
import type { DollarBasis } from '@shared/lib/types';
import { fmtCompact, fmtMoney, toBasis } from '@/lib/format';
import { ChartFrame, theme, tooltipStyle, useAnim } from './common';

/** Career earnings vs projected balance at retirement per path (the original's grouped bars). */
export function EarningsBars({ paths, activeId, basis, inflation, retirementAge, startAge }: { paths: PathResult[]; activeId: string; basis: DollarBasis; inflation: number; retirementAge: number; startAge: number }) {
  const anim = useAnim();
  const data = paths.map((p) => ({
    name: p.name.replace(/\s*\(ref\)/, '').replace('Regional', 'RGNL').replace('American', 'AA').replace('Southwest', 'SWA').replace('FedEx', 'FDX').replace('United', 'UAL').replace('Delta', 'DAL').toUpperCase(),
    earnings: Math.round(p.rows.reduce((s, r) => s + toBasis(r.wages + r.bonus + r.equityComp, r.yearIndex, inflation, basis), 0)),
    balance: Math.round(toBasis(p.netWorthAtRetirement, Math.max(0, retirementAge - startAge), inflation, basis)),
    active: p.pathId === activeId,
  }));
  return (
    <ChartFrame description={`Cumulative career earnings and projected balance at ${retirementAge} for each path`} columns={[{ key: 'name', label: 'Path' }, { key: 'earnings', label: 'Career earnings', numeric: true }, { key: 'balance', label: `Balance at ${retirementAge}`, numeric: true }]} rows={data.map((d) => ({ name: d.name, earnings: fmtMoney(d.earnings), balance: fmtMoney(d.balance) }))}>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }} barGap={4}>
            <CartesianGrid stroke={theme.grid} vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={{ stroke: theme.axis }} tick={{ fontSize: 10 }} />
            <YAxis tickFormatter={(v: number) => fmtCompact(v)} tickLine={false} axisLine={false} width={52} />
            <Tooltip {...tooltipStyle()} formatter={(v: number) => fmtMoney(v)} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            <Legend iconType="square" wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="earnings" name="Cumulative career earnings" fill={theme.asset('uslc')} isAnimationActive={anim} animationDuration={500} />
            <Bar dataKey="balance" name={`Projected balance at ${retirementAge} (P50 path)`} fill={theme.asset('intl')} isAnimationActive={anim} animationDuration={500} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
