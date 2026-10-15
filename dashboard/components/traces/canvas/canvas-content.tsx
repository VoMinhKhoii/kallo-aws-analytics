'use client';
import { useEffect, useMemo, useState } from 'react';
import { ReactFlow,Controls,Background,useReactFlow } from '@xyflow/react';
import type { buildGraph,Step } from '@/lib/traces-ui/graph';
import { TraceNode,type FlowNode } from './trace-node';
import { TimelineRuler } from './timeline-ruler';
const nodeTypes=Object.fromEntries(['request','stage','attempt','chunk','selector','rescue','gap','after-response','unattributed','ghost','response'].map(t=>[t,TraceNode]));
export function CanvasContent({graph,selected,onSelect,duration,fit}:{graph:ReturnType<typeof buildGraph>;selected:string;onSelect:(id:string)=>void;duration:number;fit:number}) {
  const flow=useReactFlow();const [hover,setHover]=useState<Step|null>(null);
  const nodes:FlowNode[]=useMemo(()=>graph.nodes.map(s=>({id:s.id,type:s.kind,position:s.position,data:{...s},selected:s.id===selected,draggable:false})),[graph,selected]);
  const edges=useMemo(()=>graph.edges.map(e=>({...e,type:'smoothstep',style:{stroke:e.failed?'var(--console-brick)':'var(--console-muted)',strokeWidth:1,strokeDasharray:e.dotted?'2 4':e.dashed?'6 4':undefined},labelStyle:{fill:'var(--console-muted)',fontSize:10},labelBgStyle:{fill:'var(--console-bg)'}})),[graph]);
  useEffect(()=>{const t=setTimeout(()=>{void flow.fitView(selected?{nodes:[{id:selected}],maxZoom:1,padding:1}:{padding:.12});},80);return()=>clearTimeout(t);},[selected,flow]);
  useEffect(()=>{void flow.fitView({padding:.12});},[fit,flow]);
  return <div className="trace-canvas flex h-full min-h-[520px] flex-col"><div className="trace-canvas-main min-h-[480px] flex-1"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodeClick={(_,n)=>onSelect(n.id)} onNodeMouseEnter={(_,n)=>setHover(n.data)} onNodeMouseLeave={()=>setHover(null)} fitView fitViewOptions={{padding:.12}} minZoom={.2} maxZoom={1.6} nodesConnectable={false} colorMode="dark" proOptions={{hideAttribution:true}}><Background gap={24} color="var(--console-rule)"/><Controls position="bottom-left" showInteractive={false}/></ReactFlow></div><TimelineRuler step={hover} duration={duration}/></div>;
}
