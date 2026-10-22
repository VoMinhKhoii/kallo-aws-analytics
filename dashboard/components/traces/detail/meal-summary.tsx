'use client';
import { useEffect, useRef } from 'react';
import type { Nutrient,TraceGraphDetail } from '@/lib/traces/types';
import { int } from '@/lib/ai-usage/format';
const nutrient=(v:Nutrient)=>v==null?'—':typeof v==='number'?int(v):<>{int(v.mid)} <span className="text-xs font-normal text-muted-foreground">({int(v.low)}–{int(v.high)})</span></>;
export function MealSummary({trace:t,openAssembly,panelOpen=false}:{trace:TraceGraphDetail;panelOpen?:boolean;openAssembly:(item:number)=>void}) {
  const ref=useRef<HTMLElement>(null);
  useEffect(()=>{
    if(!panelOpen||!ref.current)return;
    const element=ref.current, workspace=element.closest<HTMLElement>('.trace-workspace');
    const resize=()=>workspace?.style.setProperty('--sheet-height',`${Math.max(0,window.innerHeight-element.getBoundingClientRect().bottom-8)}px`);
    const observer=new ResizeObserver(resize);observer.observe(element);window.addEventListener('resize',resize);window.addEventListener('scroll',resize,true);resize();
    return()=>{observer.disconnect();window.removeEventListener('resize',resize);window.removeEventListener('scroll',resize,true);workspace?.style.removeProperty('--sheet-height');};
  },[panelOpen]);
  const error=['error','failed'].includes(t.status),s=t.summary;
  return <section ref={ref} aria-label="Meal summary" className="meal-summary max-h-[220px] min-w-0 shrink-0 break-words overflow-y-auto border-b border-border px-4 py-4"><div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">{error?<><strong className="text-2xl font-medium mark-bad">No result · {[t.errorCode??t.error??'error',...s.items.filter(i=>i.matched===false||i.grams===0||i.kcal==null).map(i=>i.name)].join(' · ')}</strong>{s.kcal!=null&&<span className="text-sm text-muted-foreground">Partial kcal {nutrient(s.kcal)}</span>}</>:<strong className="tabular text-2xl font-medium tracking-tight"><span className="mr-2 text-sm text-muted-foreground">kcal</span>{nutrient(s.kcal)}</strong>}<span className="meal-summary-details tabular text-xs text-muted-foreground">{error?'Partial · ':''}P {nutrient(s.protein)} g · C {nutrient(s.carbs)} g · F {nutrient(s.fat)} g</span></div><div className="meal-summary-details mt-2 grid grid-cols-[repeat(auto-fill,minmax(min(200px,100%),1fr))] gap-x-4 gap-y-2 text-xs leading-5">{s.items.length?s.items.map((i,index)=><button key={index} onClick={()=>openAssembly(index)} title={i.name} className={`min-w-0 text-left hover:underline`}><span className={`block truncate ${i.matched===false||i.grams===0?'mark-warn':''}`}>{i.name}{i.matched===false&&' · unmatched'}</span><span className="block text-muted-foreground">{i.grams!=null?`${int(i.grams)} g`:'— g'} · {i.grams===0?'—':nutrient(i.kcal)} kcal</span></button>):<span className="text-muted-foreground">Meal items not recorded</span>}</div></section>;
}
