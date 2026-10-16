import { z } from 'zod';
import { authorizeRequest } from '@/lib/auth';
import { connectAdminDb } from '@/lib/admin/db/client';
import { aggregateCache } from '@/lib/admin/cache';
import { loadOverview } from '@/lib/admin/overview';
export const dynamic = 'force-dynamic';
export async function GET(request:Request) {
  const access=authorizeRequest(request);
  if ('response' in access) return access.response;
  const params=new URL(request.url).searchParams;
  const days=z.enum(['7','30','90']).safeParse(params.get('days')||params.get('w')?.replace(/d$/,'')||'30');
  const json=(v:unknown,status=200,cache='no-store')=>Response.json(v,{status,headers:{'Cache-Control':cache}});
  if (!days.success) return json({error:'Invalid date window.'},400);
  try {
    const refresh=params.get('refresh')==='1';
    const result=await aggregateCache.get(`overview:v2:${process.env.DATABASE_URL}:${access.session.role}:${days.data}:${new Date().toISOString().slice(0,10)}`,60000,async()=>{
      const connection=connectAdminDb({statementTimeoutMs:8000});
      try { return await loadOverview(connection.db,Number(days.data)); } finally { await connection.close(); }
    },refresh);
    return json({...result.value,collectedAt:result.collectedAt},200,refresh?'no-store':'private, max-age=30, stale-while-revalidate=300');
  } catch { return json({error:'Production overview could not be loaded.'},502); }
}
