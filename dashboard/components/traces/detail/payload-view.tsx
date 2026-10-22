'use client';
import dynamic from 'next/dynamic';
import { useDeferredValue } from 'react';
const JsonTree=dynamic(()=>import('@/components/json-tree/json-tree'),{ssr:false,loading:()=> <div className="h-[338px] animate-pulse bg-secondary/40"/>});
export default function PayloadView({value,absent}:{value:unknown;absent:string}) {
  const deferred=useDeferredValue(value);
  if(deferred==null||deferred==='')return <p className="text-muted-foreground">{absent}</p>;
  let parsed=deferred;if(typeof deferred==='string'&&/^[\s]*[\[{]/.test(deferred)){try{parsed=JSON.parse(deferred);}catch{ /* Provider text need not be JSON. */ }}
  const serialized=typeof parsed==='string'?parsed:JSON.stringify(parsed);
  const bytes=new TextEncoder().encode(serialized);
  if(bytes.length>1024*1024)return <><p className="mb-2 text-muted-foreground mark-warn">Payload exceeds 1 MB. First 200 KB shown. Download JSON for the full payload.</p><JsonTree value={new TextDecoder().decode(bytes.slice(0,200*1024))}/></>;
  return <JsonTree value={parsed}/>;
}
