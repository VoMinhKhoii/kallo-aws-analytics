import { z } from 'zod';
import { authorizeRequest } from '@/lib/auth';
import { connectAdminDb } from '@/lib/admin/db/client';
import { loadTrace, graphDetail, traceCacheControl, captureIncomplete } from '@/lib/traces/detail';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200, cache = 'no-store') => Response.json(data, { status, headers: { 'Cache-Control': cache } });
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = authorizeRequest(request, { role: 'founder' });
  if ('response' in access) return access.response;
  const parsed = z.string().uuid().safeParse((await context.params).id);
  if (!parsed.success) return json({ error: 'Invalid trace ID.' }, 400);
  let connection;
  try {
    connection = connectAdminDb({ statementTimeoutMs: 8000 });
    const detail = await loadTrace(connection.db, parsed.data);
    if (!detail) return json({ error: 'Trace not found.' }, 404);
    return json(graphDetail(detail), 200, traceCacheControl(detail.status, new URL(request.url).searchParams.get('refresh') === '1', captureIncomplete(detail)));
  } catch { return json({ error: 'Trace could not be loaded.' }, 502); }
  finally { await connection?.close(); }
}
