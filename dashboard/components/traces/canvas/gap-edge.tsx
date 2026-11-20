'use client';
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
/** Route the gap annotation above the step cards rather than over their tables. */
export function GapEdge({id,sourceX,sourceY,targetX,targetY,label,style,markerEnd}:EdgeProps) {
  const y=Math.min(sourceY,targetY)-110,mid=(sourceX+targetX)/2;
  const path=`M ${sourceX} ${sourceY} H ${mid} V ${y} H ${targetX-16} V ${targetY} H ${targetX}`;
  return <><BaseEdge id={id} path={path} style={style} markerEnd={markerEnd}/><EdgeLabelRenderer><span className="pointer-events-none absolute rounded-[3px] border border-border bg-background px-1.5 text-xs text-muted-foreground" style={{transform:`translate(-50%, -50%) translate(${mid}px,${y}px)`}}>{label}</span></EdgeLabelRenderer></>;
}
