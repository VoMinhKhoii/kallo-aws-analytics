'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReactFlow,Controls,Background,BackgroundVariant,MiniMap,MarkerType,useReactFlow,useNodesInitialized,getViewportForBounds } from '@xyflow/react';
import type { buildGraph,Step } from '@/lib/traces-ui/graph';
import { TraceNode,NODE_WIDTH,NODE_HEIGHT,GAP_HEIGHT,type FlowNode } from './trace-node';
import { statusTone } from '../status-badge';
// graph.ts lays steps out on a 250 px grid for 220 px cards; the table cards need more room.
const SX=NODE_WIDTH/220*1.04,SY=2;
import { GapEdge } from './gap-edge';
import { TimelineRuler } from './timeline-ruler';
const edgeTypes={gap:GapEdge};
const nodeTypes=Object.fromEntries(['request','stage','attempt','chunk','selector','rescue','gap','after-response','unattributed','ghost','response'].map(t=>[t,TraceNode]));
export function CanvasContent({graph,selected,onSelect,duration,fit,panelWidth}:{graph:ReturnType<typeof buildGraph>;selected:string;onSelect:(id:string)=>void;duration:number;fit:number;panelWidth:number}) {
  const flow=useReactFlow();const initialized=useNodesInitialized();
  const canvas=useRef<HTMLDivElement>(null);
  const [hover,setHover]=useState<Step|null>(null);
  // Fixed sizes (same as TraceNode): the flow has no onNodesChange, so measured sizes never
  // reach these node objects and React Flow's queued fitView never runs. We frame it ourselves.
  const nodes:FlowNode[]=useMemo(()=>graph.nodes.map(s=>({id:s.id,type:s.kind,position:{x:s.position.x*SX,y:s.position.y*SY},width:NODE_WIDTH,height:s.kind==='gap'?GAP_HEIGHT:NODE_HEIGHT,data:{...s},selected:s.id===selected,draggable:false})),[graph,selected]);
  const edges=useMemo(()=>graph.edges.map(e=>{const color=e.failed?'var(--console-brick)':'var(--console-faint)';return {...e,type:e.label?'gap':'smoothstep',markerEnd:{type:MarkerType.ArrowClosed,width:14,height:14,color},style:{stroke:color,strokeWidth:1.25,strokeDasharray:e.dotted?'2 4':e.dashed?'6 4':undefined},labelStyle:{fill:'var(--console-muted)',fontSize: 12},labelBgStyle:{fill:'var(--console-bg)'}};}),[graph]);
  const closedZoom=useRef<number|null>(null);
  const fitGraph=useCallback(()=>{
    if(!canvas.current)return;
    const {width,height}=canvas.current.getBoundingClientRect();
    const bounds=flow.getNodesBounds(flow.getNodes());
    const fit=getViewportForBounds(bounds,width,height,.1,1,{top:'210px',right:'60px',bottom:'60px',left:'60px'});
    // A narrow screen cannot fit the whole pipeline legibly: start at the first step at a
    // readable zoom, vertically centred, and let the reader pan along it.
    // The spine is the top row, so a graph taller than the canvas is pinned by its top edge.
    const y=bounds.height*.85>height-48?24-bounds.y*.85:height/2-(bounds.y+bounds.height/2)*.85;
    const viewport=fit.zoom<.85&&!window.matchMedia('(min-width: 1024px)').matches?{zoom:.85,x:16-bounds.x*.85,y}:fit;
    void flow.setViewport(viewport);
    if(!panelWidth)closedZoom.current=viewport.zoom;
  },[flow,panelWidth]);
  const frameSelection=useCallback(()=>{
    if(!canvas.current||!flow.getNodes().length)return;
    const node=flow.getNode(selected);
    if(!panelWidth||!node){void fitGraph();return;}
    // Only vertical call attachments belong to this group; spine edges do not.
    const parent=graph.edges.find(e=>e.target===selected&&e.sourceHandle==='bottom')?.source??selected;
    const ids=new Set([parent,selected,...graph.edges.filter(e=>e.source===parent&&e.sourceHandle==='bottom').map(e=>e.target)]);
    const bounds=flow.getNodesBounds(flow.getNodes().filter(n=>ids.has(n.id)));
    const own=flow.getNodesBounds([node]);
    let {top}=canvas.current.getBoundingClientRect();
    const {width,height:canvasHeight}=canvas.current.getBoundingClientRect();
    // Below md the inspector is a bottom sheet over the canvas: bring the canvas up under the
    // sticky top bar when the sheet hides it, then centre in the part left above the sheet.
    const sheet=window.matchMedia('(min-width: 768px)').matches?null:document.querySelector('[aria-label$="step details"]');
    if(sheet&&sheet.getBoundingClientRect().top-top<160){
      const bar=document.querySelector('header.sticky')?.getBoundingClientRect().bottom??0;
      window.scrollBy({top:top-bar,behavior:'instant'});
      top=canvas.current.getBoundingClientRect().top;
    }
    const height=sheet?Math.max(0,Math.min(canvasHeight,sheet.getBoundingClientRect().top-top)):canvasHeight;
    const fullWidth=width+(window.matchMedia('(min-width: 768px)').matches?panelWidth:0);
    const fullZoom=closedZoom.current??getViewportForBounds(flow.getNodesBounds(flow.getNodes()),fullWidth,height,.1,1.25,.2).zoom;
    const zoom=Math.max(.85,fullZoom);
    // Centre the group, but keep the selected node inside the visible canvas
    // when a wide chunk group cannot all fit at a readable zoom.
    const centre=(start:number,size:number,ownStart:number,ownSize:number,available:number)=>{
      const room=Math.max(0,available/(2*zoom)-ownSize/2-16/zoom);
      const middle=ownStart+ownSize/2;
      return Math.max(middle-room,Math.min(middle+room,start+size/2));
    };
    // setViewport from our own measurement: setCenter reads React Flow's stored size,
    // which still holds the pre-panel width when the panel has just opened.
    const x=centre(bounds.x,bounds.width,own.x,own.width,width),y=centre(bounds.y,bounds.height,own.y,own.height,height);
    void flow.setViewport({x:width/2-x*zoom,y:height/2-y*zoom,zoom});
  },[initialized,flow,selected,panelWidth,graph,fitGraph]);
  useEffect(()=>{frameSelection();},[frameSelection]);
  const previousFit=useRef(fit);
  useEffect(()=>{if(previousFit.current!==fit){previousFit.current=fit;void fitGraph();}},[fit,fitGraph]);
  useEffect(()=>{
    if(!canvas.current)return;
    let frame=0;
    const observer=new ResizeObserver(()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(frameSelection);});
    observer.observe(canvas.current);
    return()=>{observer.disconnect();cancelAnimationFrame(frame);};
  },[frameSelection]);
  return <div className="trace-canvas flex h-full min-h-[520px] flex-col"><div ref={canvas} className="trace-canvas-main min-h-[480px] flex-1"><ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodeClick={(_,n)=>onSelect(n.id)} onNodeMouseEnter={(_,n)=>setHover(n.data)} onNodeMouseLeave={()=>setHover(null)} minZoom={.1} maxZoom={1.5} nodesConnectable={false} proOptions={{hideAttribution:true}}><Background variant={BackgroundVariant.Dots} gap={20} size={1.2} color="var(--console-rule-strong)"/><Controls position="bottom-left" showInteractive={false} fitViewOptions={{padding:.2,minZoom:.1,maxZoom:1.25}}/><MiniMap className="max-md:!hidden" position="bottom-right" pannable zoomable nodeColor={n=>n.data.kind==='ghost'?'var(--console-rule-strong)':`color-mix(in oklab, ${statusTone(String(n.data.status))} 55%, var(--console-surface))`} nodeStrokeWidth={0} nodeBorderRadius={4} maskColor="color-mix(in oklab, var(--console-bg) 70%, transparent)" style={{background:'var(--console-surface)',border:'1px solid var(--console-rule)',borderRadius:5,width:180,height:110}}/></ReactFlow></div><TimelineRuler steps={graph.nodes} step={hover} duration={duration}/></div>;
}
