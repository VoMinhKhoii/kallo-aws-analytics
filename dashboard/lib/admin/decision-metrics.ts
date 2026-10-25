import 'server-only';
import type { MetricName } from '@/app/lib/types';
import type { TraceDb } from '@/lib/traces/d1';

// The Ingredients page metrics, read from D1's ingredient_decisions table (the
// trace-ingest port of analytics.v_ingredient_decisions). Each query is the
// SQLite form of its Postgres original in live-metrics.ts; ingest already
// lower-cased and collapsed the whitespace in ingredient_query, so only the
// trim and length bounds are re-applied here.
export const DECISION_METRICS = ['ingredient_demand', 'ingredient_gaps', 'ingredient_rank_distribution', 'corpus_reverse_lookup', 'ingredient_mappings'] as const;
export type DecisionMetric = (typeof DECISION_METRICS)[number];
export const isDecisionMetric = (m: MetricName): m is DecisionMetric => (DECISION_METRICS as readonly string[]).includes(m);

const REJECT_BUCKETS = `'unmatched','missing','no_candidates','low_confidence','invalid_input','model_rejected','other'`;
const candidate = (k: 1 | 2 | 3) => `SELECT ${k} AS rank, json_object('rank',${k},'food_id',candidate_${k}_food_id,'name',candidate_${k}_name,'source',candidate_${k}_source,'similarity',candidate_${k}_similarity) AS obj,
  coalesce(candidate_${k}_food_id,candidate_${k}_name,candidate_${k}_source,candidate_${k}_similarity) IS NOT NULL AS keep`;

export function decisionMetricQuery(metric: DecisionMetric, from: string, to: string): { query: string; params: string[] } {
  const hourly = from.includes('T');
  const window = hourly ? 'occurred_at >= ?1 AND occurred_at < ?2' : 'occurred_on BETWEEN ?1 AND ?2';
  const params = hourly ? [new Date(from).toISOString(), new Date(to).toISOString()] : [from, to];
  const decisions = `SELECT * FROM ingredient_decisions WHERE ${window}`;
  const valid = `SELECT d.*, trim(ingredient_query) AS normalized_query FROM (${decisions}) d WHERE length(trim(ingredient_query)) BETWEEN 1 AND 160`;
  const queries: Record<DecisionMetric, string> = {
    ingredient_demand: `WITH grouped AS (
      SELECT occurred_on AS date, normalized_query AS ingredient_query, count(*) AS count FROM (${valid}) GROUP BY 1,2), ranked AS (
      SELECT *, row_number() OVER (PARTITION BY date ORDER BY count DESC, ingredient_query) AS rank FROM grouped)
      SELECT * FROM ranked WHERE rank <= 50 ORDER BY date,rank`,
    // SQLite takes bare columns beside max() from the max row: the latest trace in the group.
    ingredient_gaps: `WITH grouped AS (
      SELECT occurred_on AS date, normalized_query AS ingredient_query, verdict,
        CASE WHEN reject_bucket IN (${REJECT_BUCKETS}) THEN reject_bucket WHEN verdict='unmatched' THEN 'unmatched' ELSE 'other' END AS reject_bucket,
        count(*) AS count, max(occurred_at) AS last_seen, request_id AS last_trace_id
      FROM (${valid}) WHERE verdict IN ('unmatched','rejected') GROUP BY 1,2,3,4)
      SELECT *, row_number() OVER (ORDER BY count DESC,date,ingredient_query,verdict,reject_bucket) AS rank FROM grouped ORDER BY rank LIMIT 50`,
    ingredient_rank_distribution: `SELECT occurred_on AS date, pool_size, selected_rank, count(*) AS count,
      count(*) * 1.0 / sum(count(*)) OVER (PARTITION BY occurred_on,pool_size) AS share
      FROM (${decisions}) WHERE verdict='accepted' AND pool_size >= 1 AND selected_rank BETWEEN 1 AND pool_size GROUP BY 1,2,3 ORDER BY 1,2,3`,
    corpus_reverse_lookup: `WITH base AS (${decisions}), foods AS (
      SELECT occurred_on AS date, chosen_food_id AS food_id, chosen_name AS food_name, chosen_source AS source, count(*) AS decision_count
      FROM base WHERE verdict='accepted' AND chosen_food_id IS NOT NULL GROUP BY 1,2,3,4),
      queries AS (SELECT occurred_on AS date, chosen_food_id AS food_id, chosen_name AS food_name, chosen_source AS source, trim(ingredient_query) AS query, count(*) AS n
        FROM base WHERE verdict='accepted' AND chosen_food_id IS NOT NULL AND length(trim(ingredient_query)) BETWEEN 1 AND 160 GROUP BY 1,2,3,4,5),
      ordered AS (SELECT *, row_number() OVER (PARTITION BY date,food_id,food_name,source ORDER BY n DESC,query) AS qr FROM queries),
      examples AS (SELECT date,food_id,food_name,source,count(*) AS query_count,
        (SELECT json_group_array(query) FROM (SELECT o2.query FROM ordered o2 WHERE o2.date=o.date AND o2.food_id=o.food_id AND o2.food_name IS o.food_name AND o2.source IS o.source AND o2.qr <= 5 ORDER BY o2.qr)) AS query_examples
        FROM ordered o GROUP BY 1,2,3,4),
      grouped AS (SELECT f.*, coalesce(e.query_count,0) AS query_count, coalesce(e.query_examples,'[]') AS query_examples
        FROM foods f LEFT JOIN examples e ON f.date=e.date AND f.food_id=e.food_id AND f.food_name IS e.food_name AND f.source IS e.source)
      SELECT *, row_number() OVER (ORDER BY decision_count DESC,query_count DESC,date,food_id,coalesce(food_name,''),coalesce(source,'')) AS rank
      FROM grouped ORDER BY rank LIMIT 50`,
    // json_patch() drops null members, which is jsonb_strip_nulls().
    ingredient_mappings: `WITH base AS (${valid}), grouped AS (
      SELECT occurred_on, normalized_query AS q, count(*) AS decision_count, sum(verdict='accepted') AS accepted_count FROM base GROUP BY 1,2), variants AS (
      SELECT occurred_on, normalized_query AS q,
        nullif(json_patch('{}', json_object('food_id',chosen_food_id,'name',chosen_name,'source',chosen_source,'similarity',chosen_similarity)),'{}') AS chosen,
        (SELECT json_group_array(json(obj)) FROM (SELECT obj FROM (${candidate(1)} UNION ALL ${candidate(2)} UNION ALL ${candidate(3)}) WHERE keep ORDER BY rank)) AS candidates
      FROM base),
      counts AS (SELECT occurred_on,q,chosen,candidates,count(*) AS n FROM variants GROUP BY 1,2,3,4), ranked AS (
      SELECT *, row_number() OVER (PARTITION BY occurred_on,q ORDER BY n DESC,chosen,candidates) AS r FROM counts)
      SELECT * FROM (SELECT g.occurred_on AS date,g.q AS ingredient_query,g.decision_count,g.accepted_count,
        row_number() OVER (PARTITION BY g.occurred_on ORDER BY g.decision_count DESC,g.q) AS rank,r.chosen,r.candidates
        FROM grouped g JOIN ranked r ON r.occurred_on=g.occurred_on AND r.q=g.q WHERE r.r=1) WHERE rank <= 50 ORDER BY date,rank`,
  };
  return { query: queries[metric], params };
}

const JSON_COLUMNS: Partial<Record<DecisionMetric, string[]>> = {
  corpus_reverse_lookup: ['query_examples'],
  ingredient_mappings: ['chosen', 'candidates'],
};
/** Rows shaped like the Postgres results: JSON columns parsed back into values. */
export function decodeDecisionRows(metric: DecisionMetric, rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const columns = JSON_COLUMNS[metric] ?? [];
  return rows.map(row => {
    const out = { ...row };
    for (const c of columns) out[c] = typeof row[c] === 'string' ? JSON.parse(row[c] as string) : row[c];
    return out;
  });
}

export async function readDecisionMetric(db: TraceDb, metric: DecisionMetric, from: string, to: string): Promise<Record<string, unknown>[]> {
  const { query, params } = decisionMetricQuery(metric, from, to);
  const { results } = await db.prepare(query).bind(...params).all<Record<string, unknown>>();
  return decodeDecisionRows(metric, results);
}
