'use client';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CanvasContent } from './canvas-content';
export default function PipelineCanvas(props:Parameters<typeof CanvasContent>[0]) {return <ReactFlowProvider><CanvasContent {...props}/></ReactFlowProvider>;}
