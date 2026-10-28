import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { ASSET_CLASSES, equityPct } from '../data/models';
import type { Allocation } from '../lib/types';
import { ASSET_COLORS, ASSET_COLORS_PRINT, CHART_ANIM } from './assetColors';

export function Donut({ allocation, size = 180, print = false }: { allocation: Allocation; size?: number; print?: boolean }) {
  const colors = print ? ASSET_COLORS_PRINT : ASSET_COLORS;
  const data = ASSET_CLASSES.map((a) => ({ id: a.id, name: a.label, value: allocation[a.id] })).filter((d) => d.value > 0.01);
  const eq = equityPct(allocation);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius="64%" outerRadius="98%" stroke={print ? '#fff' : '#121821'} strokeWidth={1.5} startAngle={90} endAngle={-270} isAnimationActive={!print && CHART_ANIM} animationDuration={700}>
            {data.map((d) => <Cell key={d.id} fill={colors[d.id]} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className={`num ${size > 140 ? 'text-2xl' : 'text-lg'} ${print ? 'text-black' : 'text-white'}`}>{Math.round(eq)}%</span>
        <span className={`text-[9px] uppercase tracking-[0.16em] ${print ? 'text-[#555]' : 'text-dim'}`}>Equity</span>
      </div>
    </div>
  );
}
