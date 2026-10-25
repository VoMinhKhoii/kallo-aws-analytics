import { authorizeRequest } from '@/lib/auth';
import { connectAdminDb } from '@/lib/admin/db/client';
import { loadPipelineHealth } from '@/lib/admin/health';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// Founder only: error samples are raw exception text from the pipeline.
export async function GET(request: Request) {
  const access = authorizeRequest(request, { role: 'founder' });
  if ('response' in access) return access.response;
  const connection = connectAdminDb({ statementTimeoutMs: 8000 });
  try { return json(await loadPipelineHealth(connection.db)); }
  catch { console.error('[admin/health] Read failed'); return json({ error: 'Pipeline health could not be loaded.' }, 502); }
  finally { await connection.close(); }
}
