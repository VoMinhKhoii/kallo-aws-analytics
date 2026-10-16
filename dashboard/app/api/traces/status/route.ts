import { z } from 'zod';
import { authorizeRequest } from '@/lib/auth';
import { connectAdminDb } from '@/lib/admin/db/client';
import { traceFilters, listTraces } from '@/lib/traces/query';
import { traceStatuses } from '@/lib/traces/status';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const access = authorizeRequest(request, {role:'founder'});
  if ('response' in access) return access.response;
  const ids = z.array(z.string().uuid()).min(1).max(50).safeParse(new URL(request.url).searchParams.get('ids')?.split(','));
  const json = (body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
  if (!ids.success) return json({error:'Invalid trace IDs.'},400);
  let connection;
  try {
    connection=connectAdminDb({statementTimeoutMs:8000});
    const params=new URL(request.url).searchParams;
    if(params.get('summary')==='1') {
      const filters=traceFilters.safeParse({...Object.fromEntries(params),limit:50,cursor:undefined});
      if(!filters.success)return json({error:'Invalid trace filters.'},400);
      const result=await listTraces(connection.db,filters.data,'',ids.data);
      return json({rows:result.rows,missing:ids.data.filter(id=>!result.rows.some(r=>r.id===id))});
    }
    const rows=await traceStatuses(connection.db, [...new Set(ids.data)]);
    return json({rows,missing:ids.data.filter(id=>!rows.some(r=>r.id===id))});
  } catch { return json({error:'Trace statuses could not be loaded.'},502); }
  finally { await connection?.close(); }
}
