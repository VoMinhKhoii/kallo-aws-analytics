import { sql } from 'drizzle-orm';
import type { AppDb } from '../admin/db/client';
export interface TraceStatus { id:string; status:string; durationMs:number|null; error:string|null }
/** Deliberately excludes graph, payload and billing queries. Missing IDs are tombstones. */
export async function traceStatuses(db: AppDb, ids: string[]): Promise<TraceStatus[]> {
  if (!ids.length) return [];
  const rows = await db.execute(sql`SELECT id::text,status,duration_ms,error FROM public.pipeline_requests WHERE id IN (${sql.join(ids.map(id=>sql`${id}::uuid`),sql`, `)})`);
  return rows.map(r=>({id:String(r.id),status:String(r.status),durationMs:r.duration_ms==null?null:Number(r.duration_ms),error:r.error==null?null:String(r.error)}));
}
