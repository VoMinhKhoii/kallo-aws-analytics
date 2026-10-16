'use client';
import { apiFetch } from '@/lib/api-fetch';
import { useCallback, useEffect, useState } from 'react';
import { useRefocus } from '@/lib/use-refocus';
export function useResource<T>(url:string|null,poll?:(data:T)=>boolean) {
  const [state,setState]=useState<{data:T|null;error:string|null;loading:boolean;notFound:boolean;url:string|null}>({data:null,error:null,loading:true,notFound:false,url});
  const [version,setVersion]=useState(0);const refresh=useCallback(()=>setVersion(n=>n+1),[]);useRefocus(refresh);
  useEffect(()=>{
    if(!url){setState({data:null,error:null,loading:false,notFound:false,url:null});return;}
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;let latest:T|null=null;let failures=0;const started=Date.now();
    const schedule=()=>{if(poll&&Date.now()-started<600000&&!controller.signal.aborted)timer=setTimeout(load,Math.min(60000,5000*2**Math.min(failures,4)));};
    const load=async()=>{
      if(document.hidden&&latest){schedule();return;}
      setState(s=>s.url===url?({...s,loading:true,error:null}):({url,data:null,loading:true,error:null,notFound:false}));
      try{const r=await apiFetch(url+(url.includes('?')?'&':'?')+(version?'refresh=1':''),{signal:controller.signal,cache:version?'reload':'default'});const body=await r.json();if(!r.ok){setState(s=>({...s,error:body.error??'Request failed',loading:false,notFound:r.status===404}));failures++;if(r.status!==404&&latest&&poll?.(latest))schedule();return;}
        failures=0;latest=body;setState({data:body,error:null,loading:false,notFound:false,url});if(poll?.(body))schedule();
      }catch(e){if(!controller.signal.aborted)setState(s=>({...s,loading:false,error:e instanceof Error?e.message:'Request failed'}));failures++;if(!controller.signal.aborted&&latest&&poll?.(latest))schedule();}
    };void load();return()=>{controller.abort();clearTimeout(timer);};
  // Poll predicates are pure module-level functions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[url,version]);
  return {...state,data:state.url===url?state.data:null,loading:state.loading||state.url!==url,refresh};
}
