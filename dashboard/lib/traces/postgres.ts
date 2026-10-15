import { sql } from 'drizzle-orm';
import type { AppDb } from '../admin/db/client';
import { requestColumns } from './query';
import { postgresDetail, type Row } from './normalize';
export async function traceRequest(db: AppDb, id: string): Promise<Row | null> {
  const columns = await requestColumns(db);
  const optional = ['meal_name','model_profile','calories_kcal','protein_g','carbohydrate_g','fat_g','error_code'].map(c => columns.has(c) ? sql`${sql.identifier(c)}` : sql`NULL AS ${sql.identifier(c)}`);
  const rows = await db.execute(sql`SELECT id::text,created_at::text,status,duration_ms,error,raw_input,${sql.join(optional,sql`, `)} FROM public.pipeline_requests WHERE id=${id}::uuid`);
  return rows[0] || null;
}
export async function loadPostgresDetail(db: AppDb, request: Row) {
  const id = request.id;
  // Allocate independent 768 KiB payload budgets to stages and calls. Keep
  // scalar metadata even when a payload is omitted, and report truncation.
  const stages = await db.execute(sql`WITH sized AS (
    SELECT id,stage,stage_index,created_at,duration_ms,status,error,input_json,output_json,
      sum(octet_length(coalesce(input_json::text,''))+octet_length(coalesce(output_json::text,''))) OVER (ORDER BY stage_index,id) AS bytes
    FROM public.pipeline_stage_logs WHERE request_id=${id}::uuid ORDER BY stage_index,id LIMIT 64)
    SELECT id::text,stage,stage_index,created_at::text,duration_ms,status,error,
      CASE WHEN bytes<=786432 THEN input_json END AS input_json,CASE WHEN bytes<=786432 THEN output_json END AS output_json,
      bytes>786432 AS truncated FROM sized`);
  const calls = await db.execute(sql`WITH sized AS (
    SELECT c.id,c.stage_log_id,c.created_at,c.model,c.attempt,c.latency_ms,c.input_tokens,c.output_tokens,c.error,c.prompt_version_id,
      coalesce(c.prompt_rendered,p.template_sample) AS prompt,c.response_raw,m.provider,m.cached_tokens,m.thought_tokens,
      sum(octet_length(coalesce(c.prompt_rendered,p.template_sample,''))+octet_length(coalesce(c.response_raw,''))) OVER (ORDER BY c.created_at,c.id) AS bytes
    FROM public.pipeline_llm_calls c LEFT JOIN public.prompt_versions p ON p.id=c.prompt_version_id
      LEFT JOIN public.pipeline_llm_call_metadata m ON m.llm_call_id=c.id
    WHERE c.request_id=${id}::uuid ORDER BY c.created_at,c.id LIMIT 128)
    SELECT id::text,stage_log_id::text,created_at::text,model,attempt,latency_ms,input_tokens,output_tokens,error,prompt_version_id::text,
      provider,cached_tokens,thought_tokens,CASE WHEN bytes<=786432 THEN prompt END AS prompt_rendered,
      CASE WHEN bytes<=786432 THEN response_raw END AS response_raw,bytes>786432 AS truncated FROM sized`);
  const budget = await db.execute(sql`SELECT id::text,created_at::text,provider,model,input_tokens,output_tokens,cached_tokens,thought_tokens,
    cache_write_tokens,cost_usd,latency_ms,fallback_from,error_category FROM public.analysis_model_budget_events
    WHERE request_id=${id} AND request_count=0 ORDER BY created_at,id LIMIT 256`);
  const runs = await db.execute(sql`SELECT total_ms,pipeline_version FROM public.pipeline_runs WHERE request_id=${id} ORDER BY created_at DESC LIMIT 1`);
  return postgresDetail(request, stages as Row[], calls as Row[], budget as Row[], runs[0]);
}
