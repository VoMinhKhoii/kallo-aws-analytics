// Daily retention (owner ruling 2026-10-25): full traces 14 days, the small
// flattened ingredient decisions 30 days. Runs on event time (ISO text, which
// sorts as time); ingest clamps it to the last 15 days.
export const TRACE_DAYS = 14;
export const DECISION_DAYS = 30;
const DAY = 86_400_000;
// Small deletes keep each statement well inside D1's 30 s query limit.
const CHUNK = 5000;
const MAX_ROUNDS = 200;

async function drain(db: D1Database, table: 'trace_events' | 'ingredient_decisions', column: 'emitted_at' | 'occurred_at', cutoff: string): Promise<number> {
  let deleted = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const result = await db
      .prepare(`DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${column} < ? LIMIT ${CHUNK})`)
      .bind(cutoff)
      .run();
    deleted += result.meta.changes;
    if (result.meta.changes < CHUNK) break;
  }
  return deleted;
}

export async function reap(db: D1Database, now: number): Promise<{ traceEvents: number; decisions: number }> {
  return {
    traceEvents: await drain(db, 'trace_events', 'emitted_at', new Date(now - TRACE_DAYS * DAY).toISOString()),
    decisions: await drain(db, 'ingredient_decisions', 'occurred_at', new Date(now - DECISION_DAYS * DAY).toISOString()),
  };
}
