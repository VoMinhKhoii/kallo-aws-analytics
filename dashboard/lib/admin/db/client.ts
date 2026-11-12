import 'server-only';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { getCloudflareContext } from '@opennextjs/cloudflare';

/** The Hyperdrive binding on Workers; absent under plain Node (tests, `next dev`). */
function hyperdrive(): string | null {
  if (typeof navigator === 'undefined' || navigator.userAgent !== 'Cloudflare-Workers') return null;
  try { return (getCloudflareContext().env as { HYPERDRIVE?: { connectionString: string } }).HYPERDRIVE?.connectionString ?? null; }
  catch { return null; }
}

// A request-scoped client works in Workers; do not retain sockets between requests.
// Through Hyperdrive the connection is local and pooled, so prepared statements
// (one round trip per query, pipelined) and a few parallel connections are cheap.
// Without it, DATABASE_URL may be Supabase's transaction pooler, which needs prepare: false.
export function connectAdminDb(options: { statementTimeoutMs?: number } = {}) {
  const pooled = hyperdrive();
  if (!pooled && !process.env.DATABASE_URL) throw new Error('Admin database is not configured.');
  const url = pooled ?? new URL(process.env.DATABASE_URL!).toString();
  const client = postgres(url, {
    prepare: Boolean(pooled), max: pooled ? 5 : 1, connect_timeout: 10, idle_timeout: 5,
    // Skips a type-lookup query per connection (a round trip to Singapore); array
    // columns are returned with to_json() so they parse without it.
    fetch_types: !pooled,
    ...(options.statementTimeoutMs ? { connection: { statement_timeout: options.statementTimeoutMs } } : {}),
  });
  return { db: drizzle(client), close: () => client.end({ timeout: 1 }) };
}
export type AppDb = ReturnType<typeof drizzle>;
