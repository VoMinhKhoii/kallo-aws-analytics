import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import { connectAdminDb } from './db/client';
import type { MetricName, MetricBundle, MetricPayloadMap } from '@/app/lib/types';

// Read the same privacy-reduced views used by Glue, aggregating inside Postgres.
// This keeps the permanent console independent of an expired Academy session.
export function metricQuery(metric: MetricName, from: string, to: string): SQL {
  const time = (column: SQL) => sql`${column} >= (${from}::date::timestamp AT TIME ZONE 'UTC') AND ${column} < ((${to}::date + 1)::timestamp AT TIME ZONE 'UTC')`;
  const day = (column: SQL) => sql`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
  const normalizedQuery = sql`lower(btrim(regexp_replace(ingredient_query, '[[:space:]]+', ' ', 'g')))`;
  const decisions = sql`SELECT * FROM analytics.v_ingredient_decisions WHERE occurred_on BETWEEN ${from}::date AND ${to}::date`;
  const validDecisions = sql`SELECT d.*, ${normalizedQuery} AS normalized_query FROM (${decisions}) d
    WHERE length(btrim(regexp_replace(ingredient_query, '[[:space:]]+', ' ', 'g'))) BETWEEN 1 AND 160`;
  switch (metric) {
    case 'dau_wau': return sql`WITH days AS (SELECT generate_series(${from}::date::timestamp, ${to}::date::timestamp, interval '1 day') AT TIME ZONE 'UTC' AS d)
      SELECT to_char(d AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
        count(DISTINCT user_hash) FILTER (WHERE logged_at >= d AND user_hash <> '')::int AS dau,
        count(DISTINCT user_hash) FILTER (WHERE user_hash <> '')::int AS wau
      FROM days LEFT JOIN analytics.v_meals ON logged_at >= d - interval '6 days' AND logged_at < d + interval '1 day'
      GROUP BY d ORDER BY d`;
    case 'ai_latency': return sql`SELECT ${day(sql`created_at`)} AS date, model_call2 AS model, count(*)::int AS call_count,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY total_ms) AS p50_ms,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY total_ms) AS p95_ms,
      percentile_cont(0.99) WITHIN GROUP (ORDER BY total_ms) AS p99_ms
      FROM analytics.v_pipeline_runs WHERE ${time(sql`created_at`)} AND total_ms IS NOT NULL AND model_call2 IS NOT NULL AND model_call2 <> '' GROUP BY 1,2 ORDER BY 1,2`;
    case 'ai_failure_rate': return sql`SELECT ${day(sql`created_at`)} AS date, provider, model, count(*)::int AS event_count,
      count(*) FILTER (WHERE error_category IS NOT NULL)::int AS failure_count,
      (count(*) FILTER (WHERE error_category IS NOT NULL)::float / NULLIF(count(*),0)) AS failure_rate
      FROM analytics.v_budget_events WHERE ${time(sql`created_at`)} AND provider IS NOT NULL AND model IS NOT NULL GROUP BY 1,2,3 ORDER BY 1`;
    // Same documented Sept 9, 2026 pricing snapshot as glue/transforms.py.
    case 'token_cost_daily': return sql`WITH totals AS (SELECT ${day(sql`created_at`)} AS date, model, sum(coalesce(input_tokens,0))::float AS input_tokens, sum(coalesce(output_tokens,0))::float AS output_tokens FROM analytics.v_budget_events WHERE ${time(sql`created_at`)} AND model IS NOT NULL AND model <> '' GROUP BY 1,2), prices(model,input_price,output_price) AS (VALUES ('gemini-2.5-flash',0.30,2.50),('gemini-2.5-pro',1.25,10.00),('gemini-3.1-flash-lite',0.25,1.50))
      SELECT t.*,round(coalesce((input_tokens*p.input_price+output_tokens*p.output_price)/1000000,0)::numeric,8)::float AS cost_usd,p.model IS NOT NULL AS pricing_known FROM totals t LEFT JOIN prices p USING(model) ORDER BY date`;
    case 'match_rate': return sql`SELECT ${day(sql`created_at`)} AS date, sum(coalesce(matched_count,0))::float AS matched_count,
      sum(coalesce(unmatched_count,0))::float AS unmatched_count, sum(coalesce(ingredient_count,0))::float AS ingredient_count,
      sum(coalesce(ingredient_count,0)-coalesce(matched_count,0)-coalesce(unmatched_count,0))::float AS unaccounted_count,
      coalesce(sum(coalesce(matched_count,0))::float / NULLIF(sum(coalesce(ingredient_count,0)),0),0) AS match_rate
      FROM analytics.v_pipeline_runs WHERE ${time(sql`created_at`)} GROUP BY 1 ORDER BY 1`;
    case 'ingredient_demand': return sql`WITH grouped AS (
      SELECT occurred_on::text AS date, normalized_query AS ingredient_query, count(*)::int AS count
      FROM (${validDecisions}) d GROUP BY 1,2), ranked AS (
      SELECT *, row_number() OVER (PARTITION BY date ORDER BY count DESC, ingredient_query)::int AS rank FROM grouped)
      SELECT * FROM ranked WHERE rank <= 50 ORDER BY date,rank`;
    case 'ingredient_gaps': return sql`WITH grouped AS (
      SELECT occurred_on::text AS date, normalized_query AS ingredient_query, verdict,
        CASE WHEN reject_bucket IN ('unmatched','missing','no_candidates','low_confidence','invalid_input','model_rejected','other')
          THEN reject_bucket WHEN verdict='unmatched' THEN 'unmatched' ELSE 'other' END AS reject_bucket,
        count(*)::int AS count
      FROM (${validDecisions}) d WHERE verdict IN ('unmatched','rejected') GROUP BY 1,2,3,4)
      SELECT *, row_number() OVER (ORDER BY count DESC,date,ingredient_query,verdict,reject_bucket)::int AS rank
      FROM grouped ORDER BY rank LIMIT 50`;
    case 'ingredient_rank_distribution': return sql`SELECT occurred_on::text AS date, pool_size, selected_rank, count(*)::int AS count,
      count(*)::float / NULLIF(sum(count(*)) OVER (PARTITION BY occurred_on::text,pool_size),0) AS share FROM (${decisions}) d WHERE verdict='accepted' AND pool_size >= 1 AND selected_rank BETWEEN 1 AND pool_size GROUP BY 1,2,3 ORDER BY 1,2,3`;
    case 'corpus_reverse_lookup': return sql`WITH base AS (${decisions}), foods AS (
      SELECT occurred_on::text AS date, chosen_food_id AS food_id, chosen_name AS food_name, chosen_source AS source,
        count(*)::int AS decision_count FROM base WHERE verdict='accepted' AND chosen_food_id IS NOT NULL GROUP BY 1,2,3,4),
      queries AS (SELECT occurred_on::text AS date, chosen_food_id AS food_id, chosen_name AS food_name, chosen_source AS source,
        ${normalizedQuery} AS query, count(*) AS n FROM base
        WHERE verdict='accepted' AND chosen_food_id IS NOT NULL
          AND length(btrim(regexp_replace(ingredient_query, '[[:space:]]+', ' ', 'g'))) BETWEEN 1 AND 160 GROUP BY 1,2,3,4,5),
      examples AS (SELECT date,food_id,food_name,source,count(*)::int AS query_count,
        (array_agg(query ORDER BY n DESC,query))[1:5] AS query_examples FROM queries GROUP BY 1,2,3,4),
      grouped AS (SELECT f.*,coalesce(e.query_count,0) AS query_count,coalesce(e.query_examples,ARRAY[]::text[]) AS query_examples
        FROM foods f LEFT JOIN examples e ON f.date=e.date AND f.food_id=e.food_id
          AND f.food_name IS NOT DISTINCT FROM e.food_name AND f.source IS NOT DISTINCT FROM e.source)
      SELECT *, row_number() OVER (ORDER BY decision_count DESC,query_count DESC,date,food_id,coalesce(food_name,''),coalesce(source,''))::int AS rank
      FROM grouped ORDER BY rank LIMIT 50`;
    case 'ingredient_mappings': return sql`WITH base AS (${validDecisions}), grouped AS (
      SELECT occurred_on, normalized_query AS q, count(*)::int AS decision_count, count(*) FILTER (WHERE verdict='accepted')::int AS accepted_count FROM base GROUP BY 1,2), variants AS (
      SELECT occurred_on, normalized_query AS q,
      nullif(jsonb_strip_nulls(jsonb_build_object('food_id',chosen_food_id,'name',chosen_name,'source',chosen_source,'similarity',round(chosen_similarity::numeric,6))), '{}'::jsonb) AS chosen,
      (SELECT coalesce(jsonb_agg(c.obj ORDER BY c.rank),'[]'::jsonb) FROM (VALUES
        (1,candidate_1_name,jsonb_build_object('rank',1,'food_id',candidate_1_food_id,'name',candidate_1_name,'source',candidate_1_source,'similarity',candidate_1_similarity)),
        (2,candidate_2_name,jsonb_build_object('rank',2,'food_id',candidate_2_food_id,'name',candidate_2_name,'source',candidate_2_source,'similarity',candidate_2_similarity)),
        (3,candidate_3_name,jsonb_build_object('rank',3,'food_id',candidate_3_food_id,'name',candidate_3_name,'source',candidate_3_source,'similarity',candidate_3_similarity))) c(rank,name,obj) WHERE jsonb_strip_nulls(c.obj - 'rank') <> '{}'::jsonb) AS candidates FROM base),
      counts AS (SELECT occurred_on,q,chosen,candidates,count(*) AS n FROM variants GROUP BY 1,2,3,4), ranked AS (
      SELECT *, row_number() OVER (PARTITION BY occurred_on,q ORDER BY n DESC, chosen::text, candidates::text) AS r FROM counts)
      SELECT * FROM (SELECT g.occurred_on::text AS date,g.q AS ingredient_query,g.decision_count,g.accepted_count,
      row_number() OVER (PARTITION BY g.occurred_on ORDER BY g.decision_count DESC,g.q)::int AS rank,r.chosen,r.candidates
      FROM grouped g JOIN ranked r USING (occurred_on,q) WHERE r.r=1) result WHERE rank <= 50 ORDER BY date,rank`;
    case 'app_health': return sql`WITH controlled AS (
      SELECT to_char(date_trunc('hour',occurred_at AT TIME ZONE 'UTC'),'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS hour,
        platform,event_name,
        CASE event_name WHEN 'api_request_failed' THEN 'route' WHEN 'performance_measured' THEN 'metric'
          WHEN 'health_check_failed' THEN 'check' WHEN 'app_crashed' THEN 'fatal' END AS dimension,
        CASE event_name
          WHEN 'api_request_failed' THEN CASE WHEN btrim(route) ~ '^[a-z][a-z0-9_]{0,63}$' THEN btrim(route) ELSE 'unknown' END
          WHEN 'performance_measured' THEN CASE WHEN btrim(metric) IN ('app_startup','screen_render','meal_analysis','meal_save','api_request') THEN btrim(metric) ELSE 'unknown' END
          WHEN 'health_check_failed' THEN CASE WHEN btrim("check") IN ('api_reachable','auth_session','telemetry_ingest') THEN btrim("check") ELSE 'unknown' END
          WHEN 'app_crashed' THEN coalesce(fatal::text,'unknown') END AS dimension_value,
        CASE WHEN duration_ms BETWEEN 0 AND 120000 THEN duration_ms END AS duration_ms
      FROM analytics.v_app_health WHERE ${time(sql`occurred_at`)} AND platform IN ('web','ios','android')
        AND event_name IN ('api_request_failed','performance_measured','health_check_failed','app_crashed'))
      SELECT hour,platform,event_name,dimension,dimension_value,count(*)::int AS count,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms) AS p50_ms,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95_ms
      FROM controlled GROUP BY 1,2,3,4,5 ORDER BY 1,2,3,5`;
    case 'macro_distributions': return sql`WITH buckets AS (SELECT nutrient,low,lead(low) OVER (PARTITION BY nutrient ORDER BY low) AS high FROM (VALUES ('calories_kcal',0),('calories_kcal',100),('calories_kcal',200),('calories_kcal',300),('calories_kcal',400),('calories_kcal',500),('calories_kcal',750),('calories_kcal',1000),('protein_g',0),('protein_g',10),('protein_g',20),('protein_g',30),('protein_g',40),('protein_g',50),('protein_g',75),('protein_g',100),('carbohydrate_g',0),('carbohydrate_g',10),('carbohydrate_g',20),('carbohydrate_g',30),('carbohydrate_g',40),('carbohydrate_g',50),('carbohydrate_g',75),('carbohydrate_g',100),('fat_g',0),('fat_g',5),('fat_g',10),('fat_g',15),('fat_g',20),('fat_g',30),('fat_g',50)) b(nutrient,low)), values AS (SELECT ${day(sql`logged_at`)} AS date,v.nutrient,v.amount FROM analytics.v_meals CROSS JOIN LATERAL (VALUES ('calories_kcal',calories_kcal),('protein_g',protein_g),('carbohydrate_g',carbohydrate_g),('fat_g',fat_g)) v(nutrient,amount) WHERE ${time(sql`logged_at`)}), dates AS (SELECT DISTINCT date FROM values)
      SELECT dates.date,b.nutrient,b.low::float AS bucket_min,b.high::float AS bucket_max,count(v.amount)::int AS count FROM dates CROSS JOIN buckets b LEFT JOIN values v ON v.date=dates.date AND v.nutrient=b.nutrient AND v.amount>=b.low AND (b.high IS NULL OR v.amount<b.high) GROUP BY 1,2,3,4 ORDER BY 1,2,3`;
    case 'implausible_foods': return sql`WITH foods AS (SELECT id,name_en,type_en,coalesce(calories_kcal,0)::float AS calories_kcal,coalesce(protein_g,0)::float AS protein_g,coalesce(carbohydrate_g,0)::float AS carbohydrate_g,coalesce(fat_g,0)::float AS fat_g FROM analytics.v_food_composition), scored AS (SELECT *,4*protein_g+4*carbohydrate_g+9*fat_g AS macro_calories_kcal FROM foods)
      SELECT *,CASE WHEN calories_kcal>0 THEN abs(macro_calories_kcal-calories_kcal)/calories_kcal ELSE 0 END AS mismatch_share,
      array_remove(ARRAY[CASE WHEN calories_kcal>0 AND protein_g=0 AND carbohydrate_g=0 AND fat_g=0 THEN 'kcal_positive_all_macros_zero' END,CASE WHEN carbohydrate_g=0 AND lower(type_en) ~ '(bread|cereal|grain|noodle|pasta|rice|starch|tuber)' THEN 'carb_staple_zero_carbohydrate' END,CASE WHEN calories_kcal>0 AND abs(macro_calories_kcal-calories_kcal)/calories_kcal>0.4 THEN 'macro_calorie_mismatch_over_40_percent' END],NULL) AS reasons
      FROM scored WHERE (calories_kcal>0 AND (abs(macro_calories_kcal-calories_kcal)/calories_kcal>0.4 OR (protein_g=0 AND carbohydrate_g=0 AND fat_g=0))) OR (carbohydrate_g=0 AND lower(type_en) ~ '(bread|cereal|grain|noodle|pasta|rice|starch|tuber)') ORDER BY name_en LIMIT 1000`;
  }
}

export async function getLiveMetrics(metrics: readonly MetricName[], from: string, to: string): Promise<MetricBundle> {
  const connection = connectAdminDb();
  const data: Partial<MetricPayloadMap> = {}; const errors: Partial<Record<MetricName, string>> = {};
  try {
    for (const metric of metrics) {
      try { data[metric] = await connection.db.execute(metricQuery(metric, from, to)) as never; }
      catch { errors[metric] = 'The production analytics view could not be read.'; console.error('[metrics] View read failed:', metric); }
    }
    return { data, errors, from, to };
  } finally { await connection.close(); }
}
