'use client';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { Step } from '@/lib/traces-ui/graph';
import { plural } from '@/lib/traces-ui/graph';
import { StatusDot } from '../status-dot';
import { ms,usd } from '@/lib/ai-usage/format';
export type FlowNode=Node<Step & Record<string,unknown>>;
export function TraceNode({data:d,selected}:NodeProps<FlowNode>) {
  const stage=['stage','ghost','request','response'].includes(d.kind),gap=d.kind==='gap';
  return <div className={`rounded-md border bg-card px-3 py-2 text-[12px] ${selected?'border-foreground outline outline-1 outline-foreground':'border-border'} ${d.kind==='ghost'?'border-dashed opacity-60':''} ${gap?'border-dashed':''}`} style={{width:gap?160:stage?240:220,height:gap?40:stage?88:72}}>
    <Handle type="target" position={Position.Left} className="opacity-0"/><Handle id="top" type="target" position={Position.Top} className="opacity-0"/>
    <div className="flex items-center gap-1.5"><StatusDot status={d.status}/><strong className={`truncate font-medium ${d.afterResponse?'text-[var(--console-amber)]':''}`} title={d.name}>{d.name}</strong></div>
    {!gap&&<><div className={`tabular truncate ${stage?'mt-1':''}`} title={d.count}>{d.count||'Details not recorded'}</div><div className="truncate text-[11px] text-muted-foreground" title={d.error??undefined}>{ms(d.duration)}{d.cost!==null&&` · ${usd(d.cost)}`}{d.calls.length>0&&` · ${plural(d.calls.length,'call')}`}{d.error&&<span className="text-destructive"> · {d.error}</span>}</div></>}
    <Handle type="source" position={Position.Right} className="opacity-0"/><Handle id="bottom" type="source" position={Position.Bottom} className="opacity-0"/>
  </div>;
}
