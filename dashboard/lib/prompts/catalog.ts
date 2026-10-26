import 'server-only';
import { sql } from 'drizzle-orm';
import type { AppDb } from '../admin/db/client';

// Kallo registers each prompt builder version once in prompt_versions (name +
// hash of the builder source), with a sample of its rendered template.
export interface PromptSummary { name: string; versions: number; latestSeenAt: string }
export interface PromptVersion { id: string; codeHash: string; model: string; gitSha: string | null; firstSeenAt: string; templateSample: string }

export async function listPrompts(db: AppDb): Promise<PromptSummary[]> {
  const rows = await db.execute(sql`SELECT name, count(*)::int AS versions, to_char(max(first_seen_at) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS latest
    FROM public.prompt_versions GROUP BY name ORDER BY max(first_seen_at) DESC, name`);
  return rows.map(r => ({ name: String(r.name), versions: Number(r.versions), latestSeenAt: String(r.latest) }));
}

/** Newest first; the 50 most recent are plenty to diff a regression. */
export async function promptHistory(db: AppDb, name: string): Promise<PromptVersion[]> {
  const rows = await db.execute(sql`SELECT id::text, code_hash, model, git_sha, template_sample,
      to_char(first_seen_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS first_seen
    FROM public.prompt_versions WHERE name = ${name} ORDER BY first_seen_at DESC, id LIMIT 50`);
  return rows.map(r => ({ id: String(r.id), codeHash: String(r.code_hash), model: String(r.model), gitSha: r.git_sha == null ? null : String(r.git_sha), firstSeenAt: String(r.first_seen), templateSample: String(r.template_sample) }));
}
