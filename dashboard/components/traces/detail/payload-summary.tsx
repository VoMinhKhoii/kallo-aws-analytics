import type { TracePayload } from '@/lib/traces/types';
/** Only display fields present in the captured payload; never infer matching decisions. */
export function PayloadSummary({payload}:{payload:TracePayload|null}) {
  if(!payload||!('input' in payload))return null;
  const input=payload.input&&typeof payload.input==='object'?payload.input as Record<string,unknown>:{};
  const output=payload.output&&typeof payload.output==='object'?payload.output as Record<string,unknown>:{};
  const counts=Object.entries({...input,...output}).filter(([key,value])=>/(count|matched|failed|items|ingredients|chunks)/i.test(key)&&(typeof value==='number'||typeof value==='boolean'||Array.isArray(value)));
  return counts.length?<dl className="mt-3 grid grid-cols-2 gap-2">{counts.map(([k,v])=><div key={k} className="contents"><dt className="break-words text-muted-foreground">{k}</dt><dd>{Array.isArray(v)?`${v.length} entries`:String(v)}</dd></div>)}</dl>:null;
}
