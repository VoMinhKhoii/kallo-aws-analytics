'use client';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { Step } from '@/lib/traces-ui/graph';
import { plural } from '@/lib/traces-ui/graph';
import { ms,usd } from '@/lib/ai-usage/format';
import { StatusBadge, statusTone } from '../status-badge';
export type FlowNode=Node<Step & Record<string,unknown>>;
export const NODE_WIDTH=280, NODE_HEIGHT=176, GAP_HEIGHT=40;
const TYPE:Record<string,string>={request:'Request',stage:'Stage',ghost:'Stage',attempt:'Call',chunk:'Call',selector:'Selector',rescue:'Rescue',gap:'Gap','after-response':'After response',unattributed:'Unattributed',response:'Response'};
/** A step as a small table: what it is, what it did, how it ended and what it took. */
export function TraceNode({data:d,selected}:NodeProps<FlowNode>) {
  const gap=d.kind==='gap',ghost=d.kind==='ghost';
  const tone=ghost?'var(--console-rule-strong)':statusTone(d.status);
  const time=[d.duration!==null&&d.duration>0?ms(d.duration):null,d.cost!==null?usd(d.cost):null,d.calls.length?plural(d.calls.length,'call'):null].filter(Boolean).join(' · ');
  const rows:[string,React.ReactNode][]=[['Name',<strong key="n" className="truncate font-medium" title={d.name}>{d.name}</strong>],['Detail',<span key="d" className="truncate" title={d.count}>{d.count||'Not recorded'}{d.warning&&<span className="text-[var(--console-amber)]">{d.warning}</span>}</span>],['Status',<StatusBadge key="s" status={ghost?'missing':d.afterResponse?'dropped':d.status}/>],['Took',<span key="t" className="tabular truncate" title={d.error??undefined}>{time||'—'}</span>]];
  return <div className={`overflow-hidden rounded-[5px] bg-card text-xs transition-shadow ${ghost||gap?'border-dashed':''} ${ghost?'opacity-70':''}`} style={{width:NODE_WIDTH,height:gap?GAP_HEIGHT:NODE_HEIGHT,border:`1px ${ghost||gap?'dashed':'solid'} color-mix(in oklab, ${tone} ${selected?100:45}%, var(--console-rule))`,boxShadow:selected?`0 0 0 2px var(--console-accent)`:undefined}}>
    <Handle type="target" position={Position.Left} className="opacity-0"/><Handle id="top" type="target" position={Position.Top} className="opacity-0"/>
    {gap?<div className="px-3 py-2.5 text-muted-foreground">{d.name}</div>:<>
      <div className="flex h-8 items-center justify-between gap-2 border-b border-border px-3"><span className="inline-flex h-5 items-center rounded-[3px] border border-border px-1.5 text-muted-foreground">{TYPE[d.kind]??d.kind}</span>{d.error&&<span className="truncate text-[var(--console-brick)]" title={d.error}>{d.error}</span>}</div>
      <dl className="grid grid-cols-[64px_minmax(0,1fr)]">{rows.map(([k,v])=><div key={k} className="contents"><dt className="flex h-9 items-center border-b border-border bg-[var(--console-surface)] px-3 text-[var(--console-faint)] last-of-type:border-b-0">{k}</dt><dd className="flex h-9 min-w-0 items-center border-b border-border px-3 text-foreground">{v}</dd></div>)}</dl>
    </>}
    <Handle type="source" position={Position.Right} className="opacity-0"/><Handle id="bottom" type="source" position={Position.Bottom} className="opacity-0"/>
  </div>;
}
