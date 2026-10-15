'use client';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { Step } from '@/lib/traces-ui/graph';
import { StatusDot } from '../status-dot';
import { ms,usd } from '@/lib/ai-usage/format';
export type FlowNode=Node<Step & Record<string,unknown>>;
export function TraceNode({data:d,selected}:NodeProps<FlowNode>) {
  return <div className={`h-16 w-[200px] rounded-md border bg-card px-2.5 py-1.5 text-[11px] ${selected?'border-foreground outline outline-1 outline-foreground':'border-border'} ${d.kind==='ghost'?'border-dashed opacity-60':''}`} style={{borderStyle:d.kind==='ghost'?'dotted':undefined,borderLeftWidth:d.error||d.status==='error'?3:1,borderLeftColor:d.error||d.status==='error'?'var(--console-brick)':undefined}}>
    <Handle type="target" position={Position.Left} className="opacity-0"/><div className="flex items-center gap-1.5"><StatusDot status={d.status}/><strong className="truncate font-medium" title={d.name}>{d.name}</strong></div>
    <div className="tabular truncate">{ms(d.duration)}{d.count&&` · ${d.count}`}</div><div className="truncate text-[10px] text-muted-foreground">{d.error?<span className="text-destructive">{d.error}</span>:d.afterResponse?<span className="text-[var(--console-amber)]">finished after response</span>:d.calls.length?`${usd(d.cost)} · ${d.calls.length} calls`:d.kind}</div><Handle type="source" position={Position.Right} className="opacity-0"/>
  </div>;
}
