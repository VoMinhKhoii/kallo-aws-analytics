import 'server-only';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

// A request-scoped connection works in Workers; do not retain sockets between requests.
export function connectAdminDb() {
  if (!process.env.DATABASE_URL) throw new Error('Admin database is not configured.');
  const url = new URL(process.env.DATABASE_URL);
  const client = postgres(url.toString(), { prepare: false, max: 1, connect_timeout: 10, idle_timeout: 5 });
  return { db: drizzle(client), close: () => client.end({ timeout: 1 }) };
}
export type AppDb = ReturnType<typeof drizzle>;
