import { sql } from 'drizzle-orm';
import type { AppDb } from '../admin/db/client';
import { traceRequest, loadPostgresDetail } from './postgres';
import { loadLoggingDetail } from './logging';
import type { TraceDetail, TraceGraphDetail, TracePayload } from './types';
export async function loadTrace(db: AppDb, id: string): Promise<TraceDetail | null> {
  const row = await traceRequest(db, id);
  if (!row) return null;
  const [count] = await db.execute(sql`SELECT count(*)::int AS calls FROM public.analysis_model_budget_events WHERE request_id=${id} AND request_count=0`);
  return await loadLoggingDetail(row, Number(count.calls)) || await loadPostgresDetail(db, row, true);
}
export function graphDetail(detail: TraceDetail): TraceGraphDetail {
  const bytes = (v: unknown) => v == null ? 0 : Buffer.byteLength(JSON.stringify(v));
  return { ...detail, stages: detail.stages.map(({input, output, ...s}) => ({...s, inputBytes: s.inputBytes ?? bytes(input), outputBytes: s.outputBytes ?? bytes(output)})),
    calls: detail.calls.map(({prompt, response, ...c}) => ({...c, hasPrompt: c.hasPrompt ?? (prompt !== undefined), hasResponse: c.hasResponse ?? (response !== undefined)})) };
}
export function traceCacheControl(status: string, refresh = false): string {
  return !refresh && ['success','error','completed','failed'].includes(status) ? 'private, max-age=3600' : 'no-store';
}
export async function nodePayload(db: AppDb, detail: TraceDetail, node: string): Promise<TracePayload | null> {
  const stage = detail.stages.find(s => s.key === node);
  const call = detail.calls.find(c => c.id === node);
  if (!stage && !call) return null;
  if (detail.source === 'logging') return stage ? { input: stage.input, output: stage.output }
    : { prompt: call!.prompt ?? null, response: call!.response ?? null, ...(call!.promptIsTemplate ? {promptIsTemplate: true} : {}) };
  // Fetch only the chosen node, independently of graph loader's cumulative payload budget.
  if (stage) {
    const [row] = await db.execute(sql`SELECT input_json,output_json FROM public.pipeline_stage_logs WHERE request_id=${detail.id}::uuid AND id::text=${node}`);
    return row ? {input: row.input_json, output: row.output_json} : null;
  }
  const [row] = await db.execute(sql`SELECT coalesce(c.prompt_rendered,p.template_sample) AS prompt,c.response_raw AS response,
    c.prompt_rendered IS NULL AND p.template_sample IS NOT NULL AS template
    FROM public.pipeline_llm_calls c LEFT JOIN public.prompt_versions p ON p.id=c.prompt_version_id
    WHERE c.request_id=${detail.id}::uuid AND c.id::text=${node}`);
  return row ? {prompt: row.prompt == null ? null : String(row.prompt), response: row.response == null ? null : String(row.response), ...(row.template ? {promptIsTemplate: true} : {})} : {prompt:null,response:null};
}
