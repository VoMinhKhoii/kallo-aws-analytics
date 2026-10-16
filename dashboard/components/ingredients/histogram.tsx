"use client";
import { compact, int } from '@/lib/ai-usage/format';
import { useState } from 'react';
import type { MacroRow } from '@/app/lib/types';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from '@/components/charts/recharts';
import { SeriesRail, useLocalFocus } from '@/components/charts/series-rail';
import { UsageTooltip } from '@/components/ai-usage/usage-tooltip';
import type { ModelMeta } from '@/lib/ai-usage/models';
const nutrients = [{key:'calories_kcal',label:'Calories'},{key:'protein_g',label:'Protein'},{key:'carbohydrate_g',label:'Carbohydrate'},{key:'fat_g',label:'Fat'}];
export function Histogram({rows}: {rows:MacroRow[]}) {
  const [nutrient,setNutrient] = useState('calories_kcal'); const focus = useLocalFocus();
  const [hovered, setHovered] = useState<number | null>(null);
  const data = rows.filter(r => r.nutrient === nutrient).sort((a,b) => a.bucket_min-b.bucket_min).map(r => ({bucket:r.bucket_max == null ? `${int(r.bucket_min)}+` : `${int(r.bucket_min)}–${int(r.bucket_max)}`,count:r.count}));
  const meta = {key:'count',label:'Meals',color:'var(--console-blue)',vendor:'Other',role:''} as ModelMeta;
  return <div><div className="mb-4 flex flex-wrap gap-1" role="group" aria-label="Nutrient">{nutrients.map(n => <button key={n.key} aria-pressed={n.key === nutrient} onClick={() => setNutrient(n.key)} className="rounded px-3 py-1.5 text-xs text-muted-foreground aria-pressed:bg-secondary aria-pressed:text-foreground">{n.label}</button>)}</div><div className="flex flex-col gap-3 sm:flex-row"><div className="h-[234px] min-w-0 flex-1"><ResponsiveContainer><BarChart data={data} onMouseMove={s => setHovered(s.activePayload?.[0]?.value == null ? null : Number(s.activePayload[0].value))} onMouseLeave={() => setHovered(null)}><CartesianGrid vertical={false} stroke="var(--console-rule)" /><XAxis dataKey="bucket" minTickGap={20} tick={{fontSize:11,fill:'var(--console-muted)'}} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tickFormatter={compact} width={48} tick={{fontSize:11,fill:'var(--console-muted)'}} axisLine={false} tickLine={false} /><Tooltip content={p => <UsageTooltip active={p.active} payload={p.payload as never} label={String(p.label ?? '')} models={new Map([['count',meta]])} format={int} />} /><Bar dataKey="count" fill={meta.color} isAnimationActive={false} /></BarChart></ResponsiveContainer></div><SeriesRail focus={focus} items={[{...meta,value:int(hovered ?? data.reduce((n,r) => n+r.count,0))}]} /></div></div>;
}
