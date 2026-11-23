'use client';
import { useDeferredValue } from 'react';
import { JsonView } from './json-view';
export default function PayloadView({value,absent}:{value:unknown;absent:string}) {
  const deferred=useDeferredValue(value);
  if(deferred==null||deferred==='')return <p className="text-muted-foreground">{absent}</p>;
  let parsed=deferred;if(typeof deferred==='string'&&/^[\s]*[\[{]/.test(deferred)){try{parsed=JSON.parse(deferred);}catch{ /* Provider text need not be JSON. */ }}
  const serialized=typeof parsed==='string'?parsed:JSON.stringify(parsed);
  const bytes=new TextEncoder().encode(serialized);
  if(bytes.length>1024*1024)return <><p className="mb-2 text-muted-foreground mark-warn">Payload exceeds 1 MB. First 200 KB shown. Download JSON for the full payload.</p><JsonView value={new TextDecoder().decode(bytes.slice(0,200*1024))}/></>;
  return <JsonView value={parsed}/>;
}
