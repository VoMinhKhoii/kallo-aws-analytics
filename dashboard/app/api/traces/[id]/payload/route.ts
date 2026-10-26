import { z } from 'zod';
import { authorizeRequest } from '@/lib/auth';
import { connectAdminDb } from '@/lib/admin/db/client';
import { selectedPayload, traceCacheControl } from '@/lib/traces/detail';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200, cache = 'no-store') => Response.json(data, { status, headers: { 'Cache-Control': cache } });
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = authorizeRequest(request, { role: 'founder' });
  if ('response' in access) return access.response;
  const parsed = z.string().uuid().safeParse((await context.params).id);
  if (!parsed.success) return json({ error: 'Invalid trace ID.' }, 400);
  const node = z.string().min(1).max(180).regex(/^[a-zA-Z0-9_.:-]+$/).safeParse(new URL(request.url).searchParams.get('node'));
  if (!node.success) return json({error:'Invalid trace node.'},400);
  const params = new URL(request.url).searchParams;
  const source = z.enum(['d1','logging','postgres']).safeParse(params.get('source'));
  const kind = z.enum(['stage','call']).safeParse(params.get('kind'));
  if (!source.success || !kind.success) return json({error:'Invalid trace source or node kind.'},400);
  let connection;
  try {
    connection = connectAdminDb({ statementTimeoutMs: 8000 });
    const selected = await selectedPayload(connection.db, parsed.data, source.data, kind.data, node.data);
    if (!selected) return json({error:'Trace node not found.'},404);
    return json(selected.payload, 200, traceCacheControl(selected.status, params.get('refresh') === '1'));
  } catch { return json({ error: 'Trace could not be loaded.' }, 502); }
  finally { await connection?.close(); }
}
