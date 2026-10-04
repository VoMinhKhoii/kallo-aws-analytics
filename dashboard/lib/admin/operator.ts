import 'server-only';
import { sql } from 'drizzle-orm';
import type { AppDb } from './db/client';
export interface AdminUser { id: string; email: string }

export async function getOperator(db: AppDb): Promise<AdminUser> {
  const email = process.env.DASHBOARD_ADMIN_EMAIL?.trim().toLowerCase()
    || process.env.ADMIN_EMAILS?.split(',')[0]?.trim().toLowerCase();
  if (!email) throw new Error('Dashboard admin identity is not configured.');
  const rows = await db.execute(sql`SELECT id::text, email FROM auth.users WHERE lower(email) = ${email} LIMIT 1`);
  const user = rows[0] as unknown as AdminUser | undefined;
  if (!user) throw new Error('Dashboard admin identity was not found.');
  return user;
}
