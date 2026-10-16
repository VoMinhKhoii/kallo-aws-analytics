'use client';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { Step } from '@/lib/traces-ui/graph';
import { plural } from '@/lib/traces-ui/graph';
import { StatusDot } from '../status-dot';
import { ms,usd } from '@/lib/ai-usage/format';
export type FlowNode=Node<Step & Record<string,unknown>>;
export function TraceNode({data:d,selected}:NodeProps<FlowNode>) {
  const stage=['stage','ghost','request','response'].includes(d.kind),gap=d.kind==='gap';
  return <div className={`rounded-md border bg-card px-3 py-2 text-[12px] ${selected?'border-foreground outline outline-1 outline-foreground':'border-border'} ${d.kind==='ghost'?'border-dashed opacity-60':''} ${gap?'border-dashed':''}`} style={{width:220,height:d.afterResponse?108:gap?40:88}}>
    <Handle type="target" position={Position.Left} className="opacity-0"/><Handle id="top" type="target" position={Position.Top} className="opacity-0"/>
    <div className="flex items-center gap-1.5"><StatusDot status={d.status}/><strong className={`truncate font-medium ${['error','failed'].includes(d.status)?'text-destructive':d.afterResponse?'text-[var(--console-amber)]':''}`} title={d.name}>{d.name}</strong></div>
    {!gap&&<><div className={`tabular ${stage?'mt-1 truncate':d.afterResponse?'mt-1 text-[12px] leading-4':'line-clamp-2 text-[12px] leading-4'} ${['error','failed'].includes(d.status)?'text-destructive':''}`} title={d.count}>{d.count||'Details not recorded'}{d.warning&&<span className="text-[var(--console-amber)]">{d.warning}</span>}</div>{d.kind!=='request'&&d.kind!=='response'&&<div className="truncate text-[12px] text-muted-foreground" title={d.error??undefined}>{d.afterResponse&&<span className="text-[var(--console-amber)]">dropped · </span>}{ms(d.duration!==null&&d.duration>0?d.duration:null)}{d.cost!==null&&` · ${usd(d.cost)}`}{d.calls.length>0&&` · ${plural(d.calls.length,'call')}`}{d.error&&<span className="text-destructive"> · {d.error}</span>}</div>}</>}
    <Handle type="source" position={Position.Right} className="opacity-0"/><Handle id="bottom" type="source" position={Position.Bottom} className="opacity-0"/>
  </div>;
}
