'use client';
import { toggleBranch } from '@/lib/json-expansion';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
interface Row { path:string; key:string; value:unknown; depth:number; more?:{path:string;total:number} }
function branch(value:unknown):value is Record<string,unknown> {return value!==null&&typeof value==='object';}
export default function JsonTree({value}:{value:unknown}) {
  const [open,setOpen]=useState<Set<string>>(new Set(['$'])),[all,setAll]=useState(false),[pages,setPages]=useState<Record<string,number>>({}),[full,setFull]=useState<Set<string>>(new Set());
  const [query,setQuery]=useState(''),[copied,setCopied]=useState('');const search=useDeferredValue(query.toLowerCase());const data=useDeferredValue(value);const parent=useRef<HTMLDivElement>(null);
  const rows=useMemo(()=>{
    const out:Row[]=[];
    const walk=(v:unknown,path:string,key:string,depth:number)=>{
      const isBranch=branch(v);if(!search||key.toLowerCase().includes(search)||isBranch)out.push({path,key,value:v,depth});
      if(isBranch&&(all||open.has(path)||search)){
        const entries=Object.entries(v),limit=Array.isArray(v)&&!search?pages[path]??50:entries.length;
        entries.slice(0,limit).forEach(([k,x])=>walk(x,`${path}/${k.replaceAll('~','~0').replaceAll('/','~1')}`,k,depth+1));
        if(limit<entries.length)out.push({path:`${path}/more`,key:'',value:null,depth:depth+1,more:{path,total:entries.length}});
      }
    };walk(data,'$','root',0);return out;
  },[data,all,open,pages,search]);
  const virtual=useVirtualizer({count:rows.length,getScrollElement:()=>parent.current,estimateSize:()=>24,overscan:12,getItemKey:i=>rows[i].path});
  const copy=async(v:unknown,id:string)=>{await navigator.clipboard.writeText(typeof v==='string'?v:JSON.stringify(v,null,2)??'null');setCopied(id);};
  return <div className="min-w-0 text-[12px]"><div className="mb-2 flex flex-wrap items-center gap-3 text-muted-foreground"><button onClick={()=>{setAll(true);setOpen(new Set());}}>Expand all</button><button onClick={()=>{setAll(false);setOpen(new Set());}}>Collapse all</button><button onClick={()=>void copy(data,'all')}>{copied==='all'?'Copied':'Copy all'}</button><input aria-label="Search JSON keys" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find key…" className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1"/></div>
    <div ref={parent} className="max-h-[300px] overflow-auto rounded border border-border" tabIndex={0} aria-label="JSON tree"><div style={{height:virtual.getTotalSize(),position:'relative',width:'100%'}}>{virtual.getVirtualItems().map(item=>{const row=rows[item.index];const expandable=branch(row.value);const expanded=all||open.has(row.path)||!!search;
      const raw=typeof row.value==='string'?row.value:JSON.stringify(row.value);const long=typeof row.value==='string'&&new TextEncoder().encode(row.value).length>2048&&!full.has(row.path);
      const text=expandable?`${Array.isArray(row.value)?'Array':'Object'} (${Object.keys(row.value as object).length})`:long?`${new TextDecoder().decode(new TextEncoder().encode(String(raw)).slice(0,2048))}…`:raw;
      return <div key={row.path} ref={virtual.measureElement} data-index={item.index} className="group absolute left-0 top-0 flex min-h-6 w-full items-start gap-1 pr-2 leading-6 hover:bg-secondary" style={{transform:`translateY(${item.start}px)`,paddingLeft:8+row.depth*12}}>
        {row.more?<button className="text-[var(--console-blue)]" onClick={()=>setPages(p=>({...p,[row.more!.path]:(p[row.more!.path]??50)+50}))}>Show {Math.min(50,row.more.total-(pages[row.more.path]??50))} more</button>:<><button disabled={!expandable} aria-label={`${expanded?'Collapse':'Expand'} ${row.key}`} aria-expanded={expandable?expanded:undefined} className="w-3 shrink-0 text-muted-foreground" onClick={()=>{setOpen(s=>toggleBranch(s,all,rows.filter(r=>branch(r.value)).map(r=>r.path),row.path,expanded));setAll(false);}}>{expandable?(expanded?'▾':'▸'):''}</button><span className="shrink-0 text-muted-foreground">{row.key}:</span><span className="min-w-0 flex-1 whitespace-pre-wrap break-all" style={{color:expandable?'var(--console-muted)':typeof row.value==='string'?'var(--console-green)':typeof row.value==='number'?'var(--console-blue)':'var(--console-amber)'}}>{text}{long&&<button className="ml-2 underline" onClick={()=>setFull(s=>new Set(s).add(row.path))}>Show all</button>}</span><button className="shrink-0 text-muted-foreground opacity-0 focus:opacity-100 group-hover:opacity-100" aria-label={`Copy ${row.key}`} onClick={()=>void copy(row.value,row.path)}>{copied===row.path?'Copied':'Copy'}</button></>}
      </div>;
    })}</div></div>
  </div>;
}
