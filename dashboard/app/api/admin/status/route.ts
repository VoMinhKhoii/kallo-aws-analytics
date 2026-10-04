import { sql } from 'drizzle-orm';
import { authorizeRequest } from '@/lib/auth';
import { connectAdminDb } from '@/lib/admin/db/client';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const access = authorizeRequest(request);
  if ('response' in access) return access.response;
  const connection = connectAdminDb();
  try { await connection.db.execute(sql`SELECT 1`); return Response.json({ ok: true, authMode: 'production database' }); }
  catch { return Response.json({ ok: false, reason: 'Production database is unavailable' }); }
  finally { await connection.close(); }
}
