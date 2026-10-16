import { sql } from 'drizzle-orm';
import type { AppDb } from './db/client';
import { activePromoSql, payingSql, promoEndsSql } from './premium/targets/plan-sql';
export interface OverviewKpi { value:number|null; comparisonValue:number|null; previousValue:number|null }
export interface Overview {
  days:number; through:string;
  kpis:Record<'meals'|'errorRate'|'p95MealLatencyMs'|'dau'|'newSignups'|'openFeedback',OverviewKpi>;
  mealsDaily:{date:string;analysed:number;errors:number|null}[];
  activeUsersDaily:{date:string;dau:number;wau:number}[];
  needsAttention:{failedMealsToday:number;feedbackOpenOver48h:number;grantsEndingWithin3Days:number};
  coverage:{currentMealDays:number;previousMealDays:number;requiredDays:number;errorRetentionDays:7;p95Source:string;openFeedbackHistory:false};
}
export async function loadOverview(db:AppDb, window:number|'24h', now=new Date()):Promise<Overview> {
  if (window !== '24h' && window !== 7 && window !== 30) throw new Error('Invalid date window.');
  const hourly=window === '24h', days=hourly ? 1 : window as number;
  const today=now.toISOString().slice(0,10);
  const boundary=(offset:number)=>sql`((${today}::date+${offset}::int)::timestamp AT TIME ZONE 'UTC')`;
  const midnight=boundary(0), dayEnd=boundary(1);
  const instant=(hours:number)=>sql`${new Date(now.getTime()+hours*3600000).toISOString()}::timestamptz`;
  const end=hourly?instant(0):dayEnd, start=hourly?instant(-24):boundary(1-days), done=hourly?instant(-24):boundary(-days), prior=hourly?instant(-48):boundary(-2*days);
  const comparisonEnd=hourly?end:midnight;
  const reservation=sql`e.request_count=1 AND e.route='/api/analyze-meal' AND e.work_kind='primary'
    AND NOT EXISTS (SELECT 1 FROM public.pipeline_requests r WHERE r.id::text=e.request_id AND to_jsonb(r)->>'replay_of_request_id' IS NOT NULL)`;
  const [totals,daily,attention,errors7,hours]=await Promise.all([
    db.execute(sql`WITH windows AS (SELECT 'value' AS key,${start} AS lo,${end} AS hi UNION ALL SELECT 'comparison',${done},${comparisonEnd} UNION ALL SELECT 'previous',${prior},${done})
    SELECT w.key,
      (SELECT count(*)::int FROM public.analysis_model_budget_events e WHERE ${reservation} AND e.created_at>=lo AND e.created_at<hi) AS meals,
      (SELECT count(DISTINCT (e.created_at AT TIME ZONE 'UTC')::date)::int FROM public.analysis_model_budget_events e WHERE ${reservation} AND e.created_at>=lo AND e.created_at<hi) AS meal_days,
      (SELECT percentile_cont(0.95) WITHIN GROUP (ORDER BY total_ms) FROM public.pipeline_runs run WHERE created_at>=lo AND created_at<hi AND NOT EXISTS (SELECT 1 FROM public.pipeline_requests r WHERE r.id::text=to_jsonb(run)->>'request_id' AND to_jsonb(r)->>'replay_of_request_id' IS NOT NULL)) AS p95,
      (SELECT count(DISTINCT (created_at AT TIME ZONE 'UTC')::date)::int FROM public.pipeline_runs run WHERE created_at>=lo AND created_at<hi AND NOT EXISTS (SELECT 1 FROM public.pipeline_requests r WHERE r.id::text=to_jsonb(run)->>'request_id' AND to_jsonb(r)->>'replay_of_request_id' IS NOT NULL) AND total_ms IS NOT NULL) AS run_days,
      (SELECT count(*)::int FROM public.pipeline_requests WHERE created_at>=lo AND created_at<hi AND status='error' AND to_jsonb(pipeline_requests)->>'error_code' IS DISTINCT FROM 'non_food_input' AND to_jsonb(pipeline_requests)->>'replay_of_request_id' IS NULL) AS errors,
      (SELECT count(*)::int FROM public.pipeline_requests WHERE created_at>=lo AND created_at<hi AND to_jsonb(pipeline_requests)->>'replay_of_request_id' IS NULL) AS error_population,
      (SELECT count(*)::int FROM auth.users WHERE created_at>=lo AND created_at<hi) AS signups,
      (SELECT count(DISTINCT user_hash)::int FROM analytics.v_meals WHERE logged_at>=hi-interval '1 day' AND logged_at<hi AND user_hash<>'') AS dau
    FROM windows w`),
    db.execute(sql`WITH dates AS (SELECT generate_series((${today}::date-${days}::int)::timestamp,${today}::date::timestamp,interval '1 day') AT TIME ZONE 'UTC' AS d)
    SELECT to_char(d AT TIME ZONE 'UTC','YYYY-MM-DD') AS date,
      (SELECT count(*)::int FROM public.analysis_model_budget_events e WHERE ${reservation} AND e.created_at>=d AND e.created_at<d+interval '1 day') AS analysed,
      CASE WHEN d>=${midnight}-interval '6 days' THEN (SELECT count(*)::int FROM public.pipeline_requests WHERE created_at>=d AND created_at<d+interval '1 day' AND status='error' AND to_jsonb(pipeline_requests)->>'error_code' IS DISTINCT FROM 'non_food_input' AND to_jsonb(pipeline_requests)->>'replay_of_request_id' IS NULL) END AS errors,
      (SELECT count(DISTINCT user_hash)::int FROM analytics.v_meals WHERE logged_at>=d AND logged_at<d+interval '1 day' AND user_hash<>'') AS dau,
      (SELECT count(DISTINCT user_hash)::int FROM analytics.v_meals WHERE logged_at>=d-interval '6 days' AND logged_at<d+interval '1 day' AND user_hash<>'') AS wau
    FROM dates ORDER BY d`),
    db.execute(sql`SELECT (SELECT count(*)::int FROM public.user_feedback WHERE status='open') AS open_feedback,
      (SELECT count(*)::int FROM public.user_feedback WHERE status='open' AND created_at<${now.toISOString()}::timestamptz-interval '48 hours') AS old_feedback,
      (SELECT count(*)::int FROM public.pipeline_requests WHERE created_at>=${midnight} AND created_at<${dayEnd} AND status='error' AND to_jsonb(pipeline_requests)->>'error_code' IS DISTINCT FROM 'non_food_input' AND to_jsonb(pipeline_requests)->>'replay_of_request_id' IS NULL) AS failed_today,
      (SELECT count(*)::int FROM auth.users u WHERE ${activePromoSql(sql`u.id`)} AND NOT ${payingSql(sql`u.id`)} AND ${promoEndsSql(sql`u.id`)}<=now()+interval '3 days') AS ending_soon`),
    db.execute(sql`SELECT
      (SELECT count(*)::int FROM public.pipeline_requests r WHERE created_at>=${boundary(-6)} AND created_at<${end} AND status='error' AND to_jsonb(r)->>'error_code' IS DISTINCT FROM 'non_food_input' AND to_jsonb(r)->>'replay_of_request_id' IS NULL) AS errors,
      (SELECT count(*)::int FROM public.analysis_model_budget_events e WHERE ${reservation} AND created_at>=${boundary(-6)} AND created_at<${end}) AS meals`),
    hourly ? db.execute(sql`WITH hours AS (SELECT generate_series(${start},${end}-interval '1 hour',interval '1 hour') AS d)
      SELECT to_char(d AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS date,
      (SELECT count(*)::int FROM public.analysis_model_budget_events e WHERE ${reservation} AND e.created_at>=d AND e.created_at<d+interval '1 hour') AS analysed,
      (SELECT count(*)::int FROM public.pipeline_requests r WHERE created_at>=d AND created_at<d+interval '1 hour' AND status='error' AND to_jsonb(r)->>'error_code' IS DISTINCT FROM 'non_food_input' AND to_jsonb(r)->>'replay_of_request_id' IS NULL) AS errors
      FROM hours ORDER BY d`) : Promise.resolve([]),
  ]);
  const value=totals.find(r=>r.key==='value')!, current=totals.find(r=>r.key==='comparison')!, prev=totals.find(r=>r.key==='previous')!;
  const required=Math.ceil(days*.8), num=(v:unknown)=>v==null?null:Number(v);
  const metric=(key:string,coverage='meal_days'):OverviewKpi=>({value:num(value[key]),comparisonValue:num(current[key]),previousValue:(hourly || Number(current[coverage])>=required && Number(prev[coverage])>=required)?num(prev[key]):null});
  const rate=(r:typeof value)=>Number(r.meals)?Number(r.errors)/Number(r.meals):null;
  const a=attention[0], yesterday=daily[daily.length-2];
  return {days,through:today,kpis:{meals:metric('meals'),errorRate:hourly?{value:rate(value),comparisonValue:rate(current),previousValue:rate(prev)}:{value:rate(errors7[0]),comparisonValue:null,previousValue:null},p95MealLatencyMs:metric('p95','run_days'),
    dau:{...metric('dau'),value:Number(yesterday?.dau||0),...(hourly?{comparisonValue:null,previousValue:null}:{})},newSignups:metric('signups'),openFeedback:{value:Number(a.open_feedback),comparisonValue:null,previousValue:null}},
    mealsDaily:(hourly?hours:daily.slice(1)).map(r=>({date:String(r.date),analysed:Number(r.analysed),errors:num(r.errors)})),activeUsersDaily:daily.slice(1).map(r=>({date:String(r.date),dau:Number(r.dau),wau:Number(r.wau)})),
    needsAttention:{failedMealsToday:Number(a.failed_today),feedbackOpenOver48h:Number(a.old_feedback),grantsEndingWithin3Days:Number(a.ending_soon)},
    coverage:{currentMealDays:Number(current.meal_days),previousMealDays:Number(prev.meal_days),requiredDays:required,errorRetentionDays:7,p95Source:'pipeline_runs.total_ms; known replays excluded while request identity is retained (7 days)',openFeedbackHistory:false}};
}
