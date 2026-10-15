import { authorizeRequest } from '@/lib/auth';
import { getAuthConfig } from '@/lib/auth-config';
import { connectAdminDb } from '@/lib/admin/db/client';
import { traceFilters, listTraces, decodeCursor } from '@/lib/traces/query';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
export async function GET(request: Request) {
  const access = authorizeRequest(request, { role: 'founder' });
  if ('response' in access) return access.response;
  const parsed = traceFilters.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return json({ error: 'Invalid trace filters.' }, 400);
  const secret = getAuthConfig().sessionSecret;
  try { if (parsed.data.cursor) decodeCursor(parsed.data.cursor, parsed.data, secret); }
  catch { return json({ error: 'Invalid cursor.' }, 400); }
  let connection;
  try {
    connection = connectAdminDb({ statementTimeoutMs: 8000 });
    return json(await listTraces(connection.db, parsed.data, secret));
  } catch { return json({ error: 'Traces could not be loaded.' }, 502); }
  finally { await connection?.close(); }
}
