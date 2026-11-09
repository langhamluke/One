import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ASSET_CLASSES, ASSET_CLASS_LABELS, type Allocation } from '@shared/lib/types';
import { fmtPct } from '@/lib/format';
import { ChartFrame, theme, tooltipStyle, useAnim } from './common';

export function AllocationDonut({ allocation, size = 180, legend = true, equity, frame = true }: { allocation: Allocation; size?: number; legend?: boolean; equity?: number; frame?: boolean }) {
  const anim = useAnim();
  const data = ASSET_CLASSES.map((k) => ({ key: k, name: ASSET_CLASS_LABELS[k], value: allocation[k] })).filter((d) => d.value > 0.0005);
  const chart = (
    <div className="flex flex-wrap items-center gap-4">
      <div style={{ width: size, height: size }} className="relative shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={1.5} stroke={theme.paper2} strokeWidth={2} isAnimationActive={anim} animationDuration={600}>
              {data.map((d) => <Cell key={d.key} fill={theme.asset(d.key)} />)}
            </Pie>
            <Tooltip {...tooltipStyle()} formatter={(v: number) => fmtPct(v, 1)} />
          </PieChart>
        </ResponsiveContainer>
        {equity != null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="num font-medium text-lg leading-5">{fmtPct(equity, 0)}</span>
            <span className="label-caps">equity</span>
          </div>
        )}
      </div>
      {legend && (
        <ul className="flex flex-col gap-1 text-xs min-w-0">
          {data.map((d) => (
            <li key={d.key} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: theme.asset(d.key) }} aria-hidden />
              <span className="text-ink-2 flex-1 truncate">{d.name}</span>
              <span className="num text-ink">{fmtPct(d.value, 0)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  if (!frame) return chart;
  return (
    <ChartFrame description="Model allocation by asset class" columns={[{ key: 'name', label: 'Asset class' }, { key: 'pct', label: 'Weight', numeric: true }]} rows={data.map((d) => ({ name: d.name, pct: fmtPct(d.value, 1) }))}>
      {chart}
    </ChartFrame>
  );
}
