import { aggregateCache } from '@/lib/admin/cache';
import { authorizeRequest } from '@/lib/auth';
import { getAuthConfig } from '@/lib/auth-config';
import { connectAdminDb } from '@/lib/admin/db/client';
import { traceFilters, listTraces, decodeCursor } from '@/lib/traces/query';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200, cache = 'no-store') => Response.json(data, { status, headers: { 'Cache-Control': cache } });
export async function GET(request: Request) {
  const access = authorizeRequest(request, { role: 'founder' });
  if ('response' in access) return access.response;
  const parsed = traceFilters.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return json({ error: 'Invalid trace filters.' }, 400);
  const secret = getAuthConfig().sessionSecret;
  try { if (parsed.data.cursor) decodeCursor(parsed.data.cursor, parsed.data, secret); }
  catch { return json({ error: 'Invalid cursor.' }, 400); }
  try {
    const refresh = new URL(request.url).searchParams.get('refresh') === '1';
    const result = await aggregateCache.get('traces:v2:' + (process.env.DATABASE_URL || '') + ':' + JSON.stringify(parsed.data), 30000, async () => {
      const connection = connectAdminDb({ statementTimeoutMs: 8000 });
      try { return await listTraces(connection.db, parsed.data, secret); } finally { await connection.close(); }
    }, refresh);
    return json(result.value, 200, refresh ? 'no-store' : 'private, max-age=30');
  } catch { return json({ error: 'Traces could not be loaded.' }, 502); }
}
