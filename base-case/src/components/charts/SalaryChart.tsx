import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PathResult } from '@shared/lib/derived';
import type { DollarBasis } from '@shared/lib/types';
import { fmtCompact, fmtMoney, toBasis } from '@/lib/format';
import { ChartFrame, pathColor, tooltipStyle, useAnim } from './common';

export function SalaryChart({ paths, activeId, basis, inflation, retirementAge }: { paths: PathResult[]; activeId: string; basis: DollarBasis; inflation: number; retirementAge: number }) {
  const anim = useAnim();
  const ages = new Set<number>();
  for (const p of paths) for (const r of p.rows) if (r.age < retirementAge && r.stage !== 'retired') ages.add(r.age);
  const data = Array.from(ages).sort((a, b) => a - b).map((age) => {
    const row: Record<string, number> = { age };
    for (const p of paths) {
      const r = p.rows.find((x) => x.age === age && x.stage !== 'retired');
      if (r) row[p.pathId] = Math.round(toBasis(r.wages + r.bonus, r.yearIndex, inflation, basis));
    }
    return row;
  });
  const columns = [{ key: 'age', label: 'Age', numeric: true }, ...paths.map((p) => ({ key: p.pathId, label: p.name, numeric: true }))];
  const rows = data.map((d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, k === 'age' ? v : fmtMoney(v)])));
  return (
    <ChartFrame description={`Salary by age for ${paths.length} career path${paths.length === 1 ? '' : 's'} in ${basis === 'today' ? "today's" : 'nominal'} dollars`} columns={columns} rows={rows}>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid stroke="#E9E7E1" vertical={false} />
            <XAxis dataKey="age" tickLine={false} axisLine={{ stroke: '#DAD7CF' }} />
            <YAxis tickFormatter={(v: number) => fmtCompact(v)} tickLine={false} axisLine={false} width={52} />
            <Tooltip {...tooltipStyle} formatter={(v: number) => fmtMoney(v)} labelFormatter={(l) => `Age ${l}`} />
            {paths.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />}
            {paths.map((p, i) => (
              <Line key={p.pathId} type="monotone" dataKey={p.pathId} name={p.name} stroke={pathColor(i, p.pathId === activeId)} strokeWidth={p.pathId === activeId ? 2.5 : 1.5} dot={false} isAnimationActive={anim} animationDuration={500} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartFrame>
  );
}
