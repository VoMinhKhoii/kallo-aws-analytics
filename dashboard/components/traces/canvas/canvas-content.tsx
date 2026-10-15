'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow,Controls,Background,useReactFlow } from '@xyflow/react';
import type { buildGraph,Step } from '@/lib/traces-ui/graph';
import { TraceNode,type FlowNode } from './trace-node';
import { TimelineRuler } from './timeline-ruler';
const nodeTypes=Object.fromEntries(['request','stage','attempt','chunk','selector','rescue','gap','after-response','unattributed','ghost','response'].map(t=>[t,TraceNode]));
export function CanvasContent({graph,selected,onSelect,duration,fit,panelWidth}:{graph:ReturnType<typeof buildGraph>;selected:string;onSelect:(id:string)=>void;duration:number;fit:number;panelWidth:number}) {
  const flow=useReactFlow();
  const canvas=useRef<HTMLDivElement>(null);
  const [hover,setHover]=useState<Step|null>(null);
  const nodes:FlowNode[]=useMemo(()=>graph.nodes.map(s=>({id:s.id,type:s.kind,position:s.position,data:{...s},selected:s.id===selected,draggable:false})),[graph,selected]);
  const edges=useMemo(()=>graph.edges.map(e=>({...e,type:'smoothstep',style:{stroke:e.failed?'var(--console-brick)':'var(--console-muted)',strokeWidth:1,strokeDasharray:e.dotted?'2 4':e.dashed?'6 4':undefined},labelStyle:{fill:'var(--console-muted)',fontSize:11},labelBgStyle:{fill:'var(--console-bg)'}})),[graph]);
  const fitGraph=useCallback(()=>{
    const width=canvas.current?.clientWidth??1000;
    if(Math.max(...graph.nodes.map(n=>n.position.x+240))>width){
      void flow.setViewport({x:24,y:64,zoom:1});
    }else{
      void flow.fitView({padding:.12,minZoom:1,maxZoom:1});
    }
  },[flow,graph]);
  const centreSelection=useCallback(()=>{
    const node=graph.nodes.find(n=>n.id===selected);
    if(!node){fitGraph();return;}
    const {zoom}=flow.getViewport();
    const visible=Math.max(0,(canvas.current?.clientWidth??1000)-panelWidth);
    // A full-width mobile inspector covers the graph; preserve the viewport until it closes.
    if(visible<200)return;
    void flow.setViewport({x:visible/2-(node.position.x+110)*zoom,y:(canvas.current?.clientHeight??520)/2-(node.position.y+44)*zoom,zoom},{duration:180});
  },[flow,graph,selected,panelWidth,fitGraph]);
  useEffect(()=>{const timer=setTimeout(centreSelection,80);return()=>clearTimeout(timer);},[centreSelection]);
  useEffect(()=>{fitGraph();},[fit,fitGraph]);
  useEffect(()=>{if(!canvas.current)return;const observer=new ResizeObserver(centreSelection);observer.observe(canvas.current);return()=>observer.disconnect();},[centreSelection]);
  return <div className="trace-canvas flex h-full min-h-[520px] flex-col"><div ref={canvas} className="trace-canvas-main min-h-[480px] flex-1"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodeClick={(_,n)=>onSelect(n.id)} onNodeMouseEnter={(_,n)=>setHover(n.data)} onNodeMouseLeave={()=>setHover(null)} onInit={fitGraph} minZoom={1} maxZoom={1.6} nodesConnectable={false} colorMode="dark" proOptions={{hideAttribution:true}}><Background gap={24} color="var(--console-rule)"/><Controls position="bottom-left" showInteractive={false} onFitView={fitGraph}/></ReactFlow></div><TimelineRuler step={hover} duration={duration}/></div>;
}
