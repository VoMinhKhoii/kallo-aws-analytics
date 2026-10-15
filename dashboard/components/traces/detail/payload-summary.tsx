import type { TraceGraphDetail, TracePayload } from '@/lib/traces/types';
import { plural } from '@/lib/traces-ui/graph';
const record=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const label=(v:unknown)=>{const r=record(v);return String(r.name??r.mealItemName??r.ingredientName??r.itemName??'Unnamed');};
/** Curate only fields captured in the stage payload; raw data remains below. */
export function PayloadSummary({payload,stage,trace}:{payload:TracePayload|null;stage?:string;trace?:TraceGraphDetail}) {
  if(!payload||!('input' in payload))return stage==='assembly'&&trace?<div className="mt-3 grid gap-1">{trace.summary.items.map((i,n)=><p key={n}>{i.name} · {i.grams??'—'} g</p>)}</div>:null;
  const input=record(payload.input),output=record(payload.output),data={...input,...output,...record(output.result)};
  const fields:Record<string,string[]>={decomposition:['mealItemCount','ingredientCount','items','mealItems'],matching:['ingredientCount','matchedCount','unmatchedCount','unmatched','unmatchedIngredients'],nutrition:['chunkCount','failedChunkCount','chunks','failedChunks','failedMealItemNames'],assembly:['kcal','protein','carbs','fat','totals','boundedNutrition','displayedNutrition','items','mealItems']};
  const entries=(fields[stage??'']??Object.keys(data).filter(k=>/count|matched|failed|items|ingredients|chunks/i.test(k))).filter(k=>data[k]!=null);
  return <dl className="mt-3 space-y-2">{entries.map(k=>{const v=data[k];return <div key={k}><dt className="text-muted-foreground">{k.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase())}</dt><dd>{Array.isArray(v)?<ul className="mt-1 space-y-1">{v.map((entry,i)=>{const r=record(entry),ingredients=r.ingredients,items=r.itemNames??r.mealItemNames;return <li key={i}>{typeof entry==='string'?entry:`${label(entry)}${typeof r.grams==='number'?` · ${r.grams} g`:''}`}{Array.isArray(ingredients)&&` · ${plural(ingredients.length,'ingredient')}`}{Array.isArray(items)&&` · ${items.join(', ')}`}{r.status!=null&&` · ${r.status}`}</li>;})}{!v.length&&'None'}</ul>:typeof v==='object'?JSON.stringify(v):String(v)}</dd></div>;})}</dl>;
}
