// The D1 port of Kallo's analytics.v_verdict_pool + v_ingredient_decisions
// (supabase/migrations/20260828044402_analytics_plane_core.sql and
// 20261016035816_ingredient_decisions_30d_with_time.sql). Every bound and label
// check below mirrors a clause there; keep them in step.

export interface StoredPart {
  event_id: string;
  part: number;
  parts: number;
  type: string;
  emitted_at: string;
  body: string;
}

interface Event {
  type: string;
  at: string;
  payload: Record<string, unknown>;
}

export interface DecisionRow {
  request_id: string;
  gidx: number;
  occurred_at: string;
  occurred_on: string;
  ingredient_query: string | null;
  verdict: string;
  pool_size: number;
  selected_rank: number | null;
  reject_bucket: string | null;
  candidates: [Candidate, Candidate, Candidate];
  chosen: Candidate;
}

export interface Candidate {
  food_id: string | null;
  name: string | null;
  source: string | null;
  similarity: number | null;
}

/** Whole events from stored lines; a split event missing a part is skipped. */
export function reassemble(rows: StoredPart[]): Event[] {
  const groups = new Map<string, StoredPart[]>();
  for (const row of rows) groups.set(row.event_id, [...(groups.get(row.event_id) ?? []), row]);
  const events: Event[] = [];
  for (const parts of groups.values()) {
    const sorted = [...parts].sort((a, b) => a.part - b.part);
    if (sorted.length !== sorted[0].parts) continue;
    try {
      const lines = sorted.map((p) => JSON.parse(p.body) as Record<string, unknown>);
      const payload: unknown =
        sorted[0].parts > 1 || typeof lines[0].payload === 'string'
          ? JSON.parse(lines.map((l) => l.payload).join(''))
          : lines[0];
      // Split parts decode to any JSON value; only an object is an event.
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue;
      events.push({ type: sorted[0].type, at: sorted[0].emitted_at, payload: payload as Record<string, unknown> });
    } catch {
      // A malformed event is not a decision source.
    }
  }
  return events;
}

const text = (v: unknown): string | null =>
  v == null ? null : typeof v === 'string' ? v : JSON.stringify(v);
// Postgres btrim() with one argument trims spaces only, not other whitespace.
const btrim = (s: string) => s.replace(/^ +| +$/g, '');
const chars = (s: string) => [...s].length;
const intOf = (v: unknown): number | null => {
  const s = text(v);
  return s != null && /^-?\d+$/.test(s) ? Number(s) : null;
};

const FOOD_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SOURCE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const SIMILARITY = /^(0(\.[0-9]+)?|1(\.0+)?)$/;

export function candidate(info: unknown): Candidate {
  const i = (info && typeof info === 'object' ? info : {}) as Record<string, unknown>;
  const id = text(i.foodCompositionId);
  const name = typeof i.matchedName === 'string' ? btrim(i.matchedName) : text(i.matchedName);
  const source = text(i.source);
  // jsonb prints 1e-7 as 0.0000001, where JavaScript keeps the exponent.
  const sim =
    typeof i.similarity === 'number'
      ? i.similarity >= 0 && i.similarity <= 1
        ? i.similarity
        : null
      : typeof i.similarity === 'string' && SIMILARITY.test(i.similarity)
        ? Number(i.similarity)
        : null;
  return {
    food_id: id != null && FOOD_ID.test(id) ? id : null,
    name: name != null && chars(name) >= 1 && chars(name) <= 200 ? name.replace(/\s+/g, ' ') : null,
    source: source != null && SOURCE.test(source) ? source : null,
    similarity: sim == null ? null : Math.round(sim * 1e6) / 1e6,
  };
}

export function rejectBucket(verdict: string, reason: unknown): string | null {
  if (verdict === 'accepted') return null;
  if (verdict === 'unmatched') return 'unmatched';
  if (verdict === 'missing') return 'missing';
  // Postgres `~` lets `.` cross newlines; the s flag does the same here.
  const r = (text(reason) ?? '').toLowerCase();
  if (/(no|zero|missing).*(candidate|match)/s.test(r)) return 'no_candidates';
  if (/(confidence|similarity|score)/.test(r)) return 'low_confidence';
  if (/(invalid|malformed|empty|parse)/.test(r)) return 'invalid_input';
  if (/(model|reject|refus)/.test(r)) return 'model_rejected';
  return 'other';
}

const VERDICTS = new Set(['accepted', 'unmatched', 'rejected', 'missing']);

/** Decision rows for one request, or [] until matching and assembly both arrived. */
export function deriveDecisions(requestId: string, rows: StoredPart[]): DecisionRow[] {
  const events = reassemble(rows);
  const stage = (name: string) => events.filter((e) => e.type === 'stage' && e.payload.stage === name).at(-1);
  const assembly = stage('assembly');
  const matching = stage('matching');
  const bridged = (assembly?.payload.output as Record<string, unknown> | undefined)?.bridged;
  const verdicts = (bridged as Record<string, unknown> | undefined)?.verdicts;
  const pool = matching?.payload.output;
  if (!assembly || !matching || !Array.isArray(verdicts) || !Array.isArray(pool)) return [];

  const pools = new Map<number, unknown[]>();
  for (const entry of pool) {
    const e = (entry ?? {}) as Record<string, unknown>;
    const index = intOf(e.ingredientIndex);
    if (index != null && Array.isArray(e.candidates)) pools.set(index, e.candidates);
  }
  const request = events.find((e) => e.type === 'request');
  const occurredAt = request?.at ?? assembly.at;
  // row_number() over (order by mealItemIdx, ingredientIdx); NULLs sort last.
  const key = (v: unknown) => intOf((v as Record<string, unknown> | null)?.mealItemIdx) ?? Number.MAX_SAFE_INTEGER;
  const sub = (v: unknown) => intOf((v as Record<string, unknown> | null)?.ingredientIdx) ?? Number.MAX_SAFE_INTEGER;
  const ordered = verdicts.map((v, i) => ({ v, i })).sort((a, b) => key(a.v) - key(b.v) || sub(a.v) - sub(b.v) || a.i - b.i);

  const out: DecisionRow[] = [];
  ordered.forEach(({ v }, gidx) => {
    const vv = (v ?? {}) as Record<string, unknown>;
    const verdict = text(vv.verdict);
    if (verdict == null || !VERDICTS.has(verdict)) return;
    const cands = pools.get(gidx) ?? null;
    const sel = intOf(vv.selectedCandidateIdx);
    const picked = cands && sel != null && sel >= 0 && sel < cands.length ? sel : null;
    const info = (k: number) => (cands?.[k] as Record<string, unknown> | undefined)?.info;
    const rawName = (vv.grounded as Record<string, unknown> | undefined)?.ingredientName;
    const name = typeof rawName === 'string' ? btrim(rawName) : null;
    out.push({
      request_id: requestId,
      gidx,
      occurred_at: occurredAt,
      occurred_on: assembly.at.slice(0, 10),
      ingredient_query: name && chars(name) >= 1 && chars(name) <= 160 ? name.replace(/\s+/g, ' ').toLowerCase() : null,
      verdict,
      pool_size: cands?.length ?? 0,
      selected_rank: picked == null ? null : picked + 1,
      reject_bucket: rejectBucket(verdict, vv.rejectReason),
      candidates: [candidate(info(0)), candidate(info(1)), candidate(info(2))],
      chosen: picked == null ? candidate(null) : candidate(info(picked)),
    });
  });
  return out;
}
