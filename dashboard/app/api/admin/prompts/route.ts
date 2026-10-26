import { z } from 'zod';
import { authorizeRequest } from '@/lib/auth';
import { connectAdminDb } from '@/lib/admin/db/client';
import { listPrompts, promptHistory } from '@/lib/prompts/catalog';
export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
// Prompt names look like `decomposition-grounded:global`.
const promptName = z.string().min(1).max(120).regex(/^[a-z0-9][a-z0-9:_-]*$/i);

export async function GET(request: Request) {
  const access = authorizeRequest(request, { role: 'founder' });
  if ('response' in access) return access.response;
  const raw = new URL(request.url).searchParams.get('name');
  const name = raw == null ? null : promptName.safeParse(raw);
  if (name && !name.success) return json({ error: 'Invalid prompt name.' }, 400);
  const connection = connectAdminDb({ statementTimeoutMs: 8000 });
  try {
    if (!name) return json({ prompts: await listPrompts(connection.db) });
    const versions = await promptHistory(connection.db, name.data);
    return versions.length ? json({ name: name.data, versions }) : json({ error: 'Prompt not found.' }, 404);
  } catch { console.error('[admin/prompts] Read failed'); return json({ error: 'Prompts could not be loaded.' }, 502); }
  finally { await connection.close(); }
}
