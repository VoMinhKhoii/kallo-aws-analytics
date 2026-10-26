import { sql } from 'drizzle-orm';
import type { AppDb } from '../admin/db/client';
import { traceRequest, loadPostgresDetail } from './postgres';
import { loadD1Detail, loadD1Payload } from './d1';
import { loadLoggingDetail, loadLoggingPayload } from './logging';
import type { TraceDetail, TraceGraphDetail, TracePayload } from './types';
export async function loadTrace(db: AppDb, id: string): Promise<TraceDetail | null> {
  const row = await traceRequest(db, id);
  if (!row) return null;
  const [count] = await db.execute(sql`SELECT count(*)::int AS calls FROM public.analysis_model_budget_events WHERE request_id=${id} AND request_count=0`);
  const billed = Number(count.calls);
  const d1 = await loadD1Detail(row, billed);
  if (d1 && !captureIncomplete(d1)) return d1;
  // A D1 send can be lost (Cloud Run throttles CPU once a response ends); the stdout capture is the next copy.
  const logging = await loadLoggingDetail(row, billed);
  return selectCapture(logging ?? d1, () => loadPostgresDetail(db, row, true));
}
export function captureIncomplete(detail: Pick<TraceDetail, 'status' | 'completeness'>): boolean {
  const c = detail.completeness;
  return c.truncated || c.callsLogged < c.callsBilled ||
    (['success','completed'].includes(detail.status) && c.stagesFound < c.stagesExpected);
}
export async function selectCapture(logging: TraceDetail | null, fallback: () => Promise<TraceDetail>): Promise<TraceDetail> {
  if (logging && !captureIncomplete(logging)) return logging;
  const detail = await fallback();
  // Logging ingestion can still be in flight. Retry boundedly even if Postgres is terminal.
  if (logging) detail.completeness.truncated = true;
  return detail;
}
export function graphDetail(detail: TraceDetail): TraceGraphDetail {
  const bytes = (v: unknown) => v == null ? 0 : Buffer.byteLength(JSON.stringify(v));
  return { ...detail, stages: detail.stages.map(({input, output, ...s}) => ({...s, inputBytes: s.inputBytes ?? bytes(input), outputBytes: s.outputBytes ?? bytes(output)})),
    calls: detail.calls.map(({prompt, response, ...c}) => ({...c, hasPrompt: c.hasPrompt ?? (prompt !== undefined), hasResponse: c.hasResponse ?? (response !== undefined)})) };
}
export function traceCacheControl(status: string, refresh = false, incomplete = false): string {
  return !refresh && !incomplete && ['success','error','completed','failed'].includes(status) ? 'private, max-age=3600' : 'no-store';
}
// D1 and Logging calls carry the prompt version, not the prompt: show its template, as Postgres does when nothing was rendered.
async function withTemplate(db: AppDb, payload: { prompt: string | null; response: string | null }, versionId: unknown): Promise<TracePayload> {
  if (payload.prompt != null || typeof versionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(versionId)) return payload;
  const [row] = await db.execute(sql`SELECT template_sample FROM public.prompt_versions WHERE id=${versionId}::uuid`);
  return row?.template_sample == null ? payload : { ...payload, prompt: String(row.template_sample), promptIsTemplate: true };
}
export async function nodePayload(db: AppDb, detail: TraceDetail, node: string): Promise<TracePayload | null> {
  const stage = detail.stages.find(s => s.key === node);
  const call = detail.calls.find(c => c.id === node);
  if (!stage && !call) return null;
  if (detail.source !== 'postgres') return stage ? { input: stage.input, output: stage.output }
    : withTemplate(db, { prompt: call!.prompt ?? null, response: call!.response ?? null }, call!.promptVersionId);
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

const completedRequests = new Map<string,{row: Record<string,any>; expires:number}>();
async function payloadRequest(db:AppDb,id:string) {
  const cached=completedRequests.get(id);
  if(cached && cached.expires>Date.now())return cached.row;
  completedRequests.delete(id);
  const [row]=await db.execute(sql`SELECT id::text,created_at::text,status,duration_ms FROM public.pipeline_requests WHERE id=${id}::uuid`);
  if(row && ['success','error','completed','failed'].includes(String(row.status))){
    if(completedRequests.size>=128)completedRequests.delete(completedRequests.keys().next().value!);
    completedRequests.set(id,{row,expires:Date.now()+30000});
  }
  return row;
}
/** No graph reload: request metadata and the selected, ownership-scoped payload only. */
export async function selectedPayload(db: AppDb, id: string, source: TraceDetail['source'], kind: 'stage' | 'call', node: string) {
  const request = await payloadRequest(db,id);
  if (!request) return null;
  if (source !== 'postgres') {
    const found = await (source === 'd1' ? loadD1Payload : loadLoggingPayload)(request, node, kind);
    if (!found) return null;
    const { promptVersionId, ...payload } = found;
    return { payload: 'prompt' in payload ? await withTemplate(db, payload, promptVersionId) : payload, status: String(request.status) };
  }
  if (kind === 'stage') {
    const [row] = await db.execute(sql`SELECT input_json,output_json FROM public.pipeline_stage_logs WHERE request_id=${id}::uuid AND id::text=${node}`);
    return row ? {payload: {input: row.input_json, output: row.output_json}, status: String(request.status)} : null;
  }
  if (node.startsWith('budget:')) {
    const [row] = await db.execute(sql`SELECT id FROM public.analysis_model_budget_events WHERE request_id=${id} AND id::text=${node.slice(7)} AND request_count=0`);
    return row ? {payload: {prompt:null,response:null}, status: String(request.status)} : null;
  }
  const [row] = await db.execute(sql`SELECT coalesce(c.prompt_rendered,p.template_sample) AS prompt,c.response_raw AS response,
    c.prompt_rendered IS NULL AND p.template_sample IS NOT NULL AS template
    FROM public.pipeline_llm_calls c LEFT JOIN public.prompt_versions p ON p.id=c.prompt_version_id
    WHERE c.request_id=${id}::uuid AND c.id::text=${node}`);
  return row ? {payload: {prompt: row.prompt, response: row.response, ...(row.template ? {promptIsTemplate:true} : {})}, status: String(request.status)} : null;
}
