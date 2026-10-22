'use client';
import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react';
/** Keep the gap annotation above the compact spine rather than over node text. */
export function GapEdge({id,sourceX,sourceY,targetX,targetY,label,style}:EdgeProps) {
  const y=Math.min(sourceY,targetY)-64,mid=(sourceX+targetX)/2;
  const path=`M ${sourceX} ${sourceY} H ${mid} V ${y} H ${targetX-12} V ${targetY} H ${targetX}`;
  return <><BaseEdge id={id} path={path} style={style}/><EdgeLabelRenderer><span className="pointer-events-none absolute rounded bg-background px-1 text-xs text-muted-foreground" style={{transform:`translate(-50%, -50%) translate(${mid}px,${y}px)`}}>{label}</span></EdgeLabelRenderer></>;
}
