import { sql } from 'drizzle-orm';
import { authorizeRequest } from '@/lib/auth';
import { connectAdminDb } from '@/lib/admin/db/client';
import { edgeCached } from '@/lib/edge-cache';
export const dynamic = 'force-dynamic';
// Every page's top bar asks this, so one database ping per colo every 15 s answers them all.
export async function GET(request: Request) {
  const access = authorizeRequest(request);
  if ('response' in access) return access.response;
  return edgeCached(request, access.session.role, { fresh: 15_000, stale: 60_000 }, async () => {
    const connection = connectAdminDb();
    try { await connection.db.execute(sql`SELECT 1`); return Response.json({ ok: true, authMode: 'production database' }); }
    catch { return Response.json({ ok: false, reason: 'Production database is unavailable' }); }
    finally { await connection.close(); }
  });
}
