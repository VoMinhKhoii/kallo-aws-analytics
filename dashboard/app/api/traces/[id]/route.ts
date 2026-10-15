import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { authorizeRequest } from '@/lib/auth';
import { connectAdminDb } from '@/lib/admin/db/client';
import { traceRequest, loadPostgresDetail } from '@/lib/traces/postgres';
import { loadLoggingDetail } from '@/lib/traces/logging';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = authorizeRequest(request, { role: 'founder' });
  if ('response' in access) return access.response;
  const parsed = z.string().uuid().safeParse((await context.params).id);
  if (!parsed.success) return json({ error: 'Invalid trace ID.' }, 400);
  let connection;
  try {
    connection = connectAdminDb({ statementTimeoutMs: 8000 });
    const row = await traceRequest(connection.db, parsed.data);
    if (!row) return json({ error: 'Trace not found.' }, 404);
    const [count] = await connection.db.execute(sql`SELECT count(*)::int AS calls FROM public.analysis_model_budget_events WHERE request_id=${parsed.data} AND request_count=0`);
    return json(await loadLoggingDetail(row, Number(count.calls)) || await loadPostgresDetail(connection.db, row));
  } catch { return json({ error: 'Trace could not be loaded.' }, 502); }
  finally { await connection?.close(); }
}
