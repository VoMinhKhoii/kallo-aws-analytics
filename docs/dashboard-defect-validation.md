# Dashboard defect validation and remediation

**Validated:** 6 September 2026
**Scope:** Kallo analytics dashboard, AWS aggregate read path, and source-controlled documentation
**Live-environment boundary:** local, Vercel, and disposable ALB E2E used the configured development Supabase project and the deployed `kallo-data` AWS stack in account `902339462666`, region `us-east-1`. The matching dashboard revision is deployed at `https://kallo-aws-analytics.vercel.app`. The AWS presentation stack was created only long enough to capture evidence and was then deleted; no IAM resource was created.

## 1. Executive result

The apparently inconsistent dashboard is using two different data paths:

| Surface | Source | Expected freshness | What an empty state means |
|---|---|---:|---|
| **Live source summary** and Supabase drilldowns | Cached, read-only Supabase RPCs | Near-live | The RPC returned no eligible source rows, or the RPC failed. |
| **Observe** panels (Today, AI, Ingredients, System) | Latest AWS Glue aggregate snapshot served from DynamoDB, plus explicitly labelled bounded Supabase ingredient drilldowns | After a successful extract → Glue → loader run; drilldowns are near-live | **No data** means the selected aggregate has no eligible rows. **Source unavailable** means the query failed. These states are intentionally distinct. |
| **Diagnose** panels | Latest AWS aggregate snapshot served from DynamoDB | After a successful pipeline run; then cached | These pages inspect pipeline, retrieval, trace-contract and corpus behavior from the same 13-metric operational contract. |

This explains why the same page could show populated Supabase counts and empty AWS product metrics. The values were not contradictory: they came from separate sources with different contracts and refresh schedules.

## 2. Validated defects

| ID | Severity | Validation | Root cause | Resolution |
|---|---|---|---|---|
| DASH-01 | High | **Confirmed; fixed** | Diagnose pages loaded every metric even when their panels used only a subset. The serial reads made each uncached route wait for unrelated work. | Pipeline, Retrieval, and Coverage now request 3 metrics each. Trace intentionally keeps all 13 because contract coverage is its purpose. |
| DASH-02 | High | **Confirmed** | Diagnose used `resolveMetric()` to combine every DynamoDB item in the date range. Each item is already a complete aggregate snapshot, so combining loader dates could duplicate counts. | All Diagnose routes now use `getCachedSelectedMetrics()`, which retains only the newest complete snapshot. |
| DASH-03 | Medium | **Confirmed** | KPI ribbons formatted missing values as **No data** even when the metric request had failed. Lower panels correctly said **Source unavailable**, producing contradictory states on one page. | Ribbon items now accept loading/error state. They show **Loading…**, **Unavailable**, or **No data** as three distinct outcomes across Today, AI, Ingredients, and System. |
| DASH-04 | Medium | **Confirmed** | Diagnose Server Components awaited AWS reads without a route loading boundary, so uncached navigation looked frozen. | Pipeline, Trace, Retrieval, and Coverage now have route-level loading skeletons. |
| DATA-01 | Operational | **Confirmed; deployed** | The reduced dashboard requires six sanitized analytics views, a matching 13-metric extractor/transform/loader/API contract, and a fresh successful snapshot. | The development Supabase migration was verified, the complete AWS revision was deployed, and run `3cf4376f-4f81-4df7-8de5-4c726e5d3141` completed with 9,222 source rows and all 13 aggregate files. Empty app-health metrics remain honest because the source view returned zero rows. |
| DATA-02 | Expected trade-off | **Confirmed** | AWS bundles are cached for five minutes and browser responses are private-cached for 30 seconds. The first view after cache expiry also pays serial API/Lambda latency. This is why Diagnose data could appear only after a delay and subsequent visits were faster. | Retained to protect the USD 50 lab and API limits. The new loading states expose progress; page-scoped reads reduce the delay without increasing concurrency. |
| DOC-01 | Medium | **Confirmed; fixed** | Architecture documents had drifted across older seven-, eleven-, twelve-, and 23-contract revisions. | Documentation and draw.io sources now describe full snapshots, six sanitized views, 13 operational aggregates, and the current API/cache/concurrency boundaries. |
| TEST-01 | Medium | **Confirmed** | The documented root `pytest` command could not import the `lambdas` package because the repository root was absent from pytest's import path. | Added `pythonpath = .` to `pytest.ini`; the unmodified documented command now passes all tests. |
| DEPLOY-01 | High | **Confirmed; fixed in AWS** | The earlier deployed metrics Lambda and dashboard source used different metric allowlists. | The six-view/13-metric revision was deployed as one data-plane unit and every aggregate path returned HTTP 200 after the fresh snapshot. The corresponding dashboard source remains uncommitted/unpushed. |
| UX-01 | Medium | **Confirmed; fixed and deployed** | Global search said “paste a request id,” but its old hex-only detector rejected hyphenated UUIDs and then routed matches to `/trace` without the id. | Complete request UUIDs now produce an explicit result and route to `/trace?request=<uuid>`. The production route was re-verified with a real request id. |
| UX-02 | Medium | **Confirmed; fixed and deployed** | AI trace links navigated to `/trace?request=<uuid>`, but Trace viewer ignored the query parameter and rendered only aggregate contract coverage. | Trace now consumes the request parameter and renders bounded stage, timing and ingredient-decision details from the existing sanitized Supabase trace RPC. The live check returned four stages and two ingredient decisions; raw stage payloads remain excluded from the UI. |
| DASH-05 | High | **Confirmed locally and in Vercel against live AWS** | Observe pages started redundant bundles/status probes while metrics and authoriser each had one reserved execution. CloudWatch recorded 16 authoriser throttles and 8 metrics throttles with zero function errors. The initial TTL update did not replace the immutable API deployment. Production then exposed a separate issue hidden by Next.js development mode: sidebar links automatically prefetched data-heavy Diagnose routes, producing 11 aborted hidden requests while Today loaded. Vercel retained the resulting failed Today bundle in its persistent five-minute data cache across the next deployment. The first production harness also navigated to Today twice—once from login and once from its route loop—creating an artificial duplicate cold bundle; a distinct 31-day probe returned all six metrics with no errors. | Today and System issue one page-scoped bundle each; System derives status from that bundle; metrics and authoriser use two executions; a replacement API deployment caches the stage-scoped Allow for five minutes; sidebar links set `prefetch={false}`; the metric-cache namespace excludes pre-fix/test-poisoned bundles; and E2E reuses the post-login Today navigation. Total reserved concurrency is nine; API Gateway's 2 rps, burst 5 and monthly quota remain unchanged. |
| DEPLOY-02 | High | **Confirmed on the AWS ALB; fixed** | The first presentation task had none of the five private-console authentication variables. Even with credentials supplied, its session cookie was always `Secure`, so an HTTP-only classroom ALB could not retain it. | The disposable stack now creates five stack-owned Secrets Manager values from `NoEcho` parameters, injects them into ECS, and explicitly sets `DASHBOARD_COOKIE_SECURE=false` only for the HTTP ALB. Vercel and every unspecified environment retain secure cookies by default. |
| DEPLOY-03 | High | **Confirmed on the AWS ALB; fixed** | The AWS aggregate panels worked, but direct cached Supabase RPC panels returned HTTP 503 because the ECS task lacked the URL, restricted analytics JWT, and publishable gateway key. | `lab-up.sh` resolves the existing `kallo-data` Supabase secret ARN and the task injects its `url`, `analytics_jwt`, and `api_key` JSON keys. No credential value is copied into the presentation template or logs. |

## 3. Local E2E against deployed AWS — 5 September 2026

| Check | Real result |
|---|---|
| Vercel production | Deployment `dpl_9SHKqXxj7se9PsNf2muMhngQLN3m` reached **Ready** and owns `https://kallo-aws-analytics.vercel.app`. Its remote build compiled, type-checked, and generated all 16 static pages. |
| Fresh pipeline | Extract run `3cf4376f-4f81-4df7-8de5-4c726e5d3141` read 9,222 rows from six views; Glue run `jr_14e...fc93` succeeded in 79 seconds and produced all 13 aggregate files; loader reached `completed`. |
| AWS stack | `kallo-data` reached `UPDATE_COMPLETE` at `2026-09-05T10:53:47.144Z`; 58 resources, zero IAM resources. No presentation stack was present. |
| API deployment | Stage `prod` points to deployment `2cszqc`, created `2026-09-05T17:53:51+07:00`; TOKEN authorizer TTL is 300 seconds. |
| Cost guard | Metrics and authorizer reserved concurrency are 2 each; the other five Lambdas are 1 each; total reserved concurrency is 9/10. Glue was not rerun for the serving-only correction. |
| Eight-page browser pass | Today, AI, Ingredients, System, Pipeline overview, Trace viewer, Retrieval & matching, and Coverage & corpus all completed with zero **Source unavailable** and zero lingering loading states. |
| Honest absence | AI contained one valid empty subsection. System contained four valid app-health absence labels because `v_app_health` produced zero source rows. |
| API boundaries | Authenticated metrics returned HTTP 200 with `dau_wau` and `ai_latency` and no per-metric errors; the bounded analytics RPC returned 200; reviewer `POST /api/runs` returned 403. |
| Browser diagnostics | Zero page errors, console errors, failed requests, and HTTP responses at or above 400 during the founder page pass. |
| Post-fix CloudWatch window | Metrics: 26 invocations, 0 errors, 0 throttles. Authorizer: 2 invocations, 0 errors, 0 throttles. This verifies the cache covered repeated metric reads. |
| Final production browser pass | The same eight routes completed with zero source errors and zero loading states. Browser diagnostics contained zero page errors, console errors, failed requests, and bad responses. |

The E2E suite deliberately did **not** click **Run snapshot**. The fresh pipeline had already succeeded, and another Glue run would spend from the capped Learner Lab budget.

## 4. Disposable AWS presentation and final Vercel evidence — 6 September 2026

The first ALB pass was intentionally stopped after it exposed `DEPLOY-02`. After the authentication correction, a second pass exposed `DEPLOY-03`; that stack was updated in place and tested again rather than starting another data pipeline run.

| Check | Real result |
|---|---|
| Container image | ECR digest `sha256:efc83606ffc82c614e716c33a91f179928666a52818b0b0bffc19680b88add7d`; local inspection confirmed `linux/amd64`. |
| Presentation resources | CloudFormation created 14 resources with zero IAM resources, including five disposable login secrets. ECS reached 1 desired / 1 running task and the ALB target was healthy. |
| AWS ALB browser pass | All eight routes completed with zero **Source unavailable** and zero lingering loading states. Authenticated metrics and the bounded analytics RPC returned HTTP 200; reviewer `POST /api/runs` returned HTTP 403. Browser page, console, request, and response error arrays were empty. |
| Honest absence | AI retained one valid empty subsection; System retained four valid empty app-health labels. Neither was a failed source request. |
| Teardown | Deletion completed after service draining. Independent regional queries returned no active `kallo-presentation` stack, matching ALB, ECS cluster, presentation log group, or disposable presentation secret. |
| Final Vercel deployment | Deployment `dpl_D4ejnoRZBYEux9nyXMqMKzyznSra` reached **Ready** and owns `https://kallo-aws-analytics.vercel.app`. Login returned HTTP 200 with a redacted cookie carrying `Secure`, `HttpOnly`, and `SameSite=Strict`. |
| Final Vercel browser pass | Today, AI, Ingredients, System, Pipeline overview, Trace viewer, Retrieval & matching, and Coverage & corpus completed with zero unavailable sources or loading states. Metrics and analytics RPCs returned HTTP 200, reviewer mutation returned HTTP 403, and all browser diagnostic arrays were empty. |

Evidence screenshots captured from the real ALB deployment are [Today](doc_images/aws-alb-today-2026-09-06.png), [AI](doc_images/aws-alb-ai-2026-09-06.png), and [Ingredients](doc_images/aws-alb-ingredients-2026-09-06.png). The diagrams were regenerated from their source builders and both `.drawio` files validate without errors or warnings.

## Appendix A — historical production E2E result, 2 September 2026

### Passed boundaries

| Check | Real result |
|---|---|
| Vercel deployment | Final production deployment `dpl_FG67NNWXm4JewXHTH2RCd3aSthBo` reached **Ready** and owns the production alias. |
| Founder authentication | `POST /api/auth/login` returned HTTP `200` with role `founder`; the UI established the signed session and exposed founder-only controls. |
| Unauthenticated API boundary | `GET /api/metrics` without a dashboard session returned HTTP `401`. |
| Supabase live summary | Today rendered 4 active actors, 18 saved meals, 53 pipeline requests and 19 request errors. |
| AI live traces | AI rendered 30 available cached trace rows; the visible page contained 12 bounded request links. |
| Ingredient drilldowns | Live RPC panels rendered 28 reverse rows, 37 corpus rows, 8 unresolved queries and 16 overturn groups. |
| Legacy AWS metric contract | A direct authenticated bundle returned `dau_wau`, `ai_latency`, `ai_failure_rate`, `token_cost_daily` and `implausible_foods` with no per-metric errors. |
| Diagnose routes | Pipeline, Trace, Retrieval and Coverage rendered real AWS-backed data. Warm observed route times were 1.103 s, 0.744 s, 0.729 s and 0.781 s respectively. |
| Controls | 7-day/30-day selection state, platform selection and intentionally disabled unsupported dimensions behaved correctly. |
| Global page navigation | Command palette exposed all nine dashboard destinations and route navigation worked. |
| Request-ID trace | The redeployed production route consumed a real request UUID; its bounded RPC returned HTTP `200`, matched the requested id, and supplied four pipeline stages and two ingredient decisions. |
| Mobile | At 390 × 844 the navigation drawer opened, contained all nine destinations and remained readable without overlap. |
| Browser console | No browser warning or error entries were captured during the route and interaction pass. |

### Failed production contracts

The authenticated `/api/metrics` proxy returned HTTP `200` bundles with explicit per-metric errors for every new name:

```text
product_funnel                 metric is not a supported aggregate
product_retention              metric is not a supported aggregate
journey_transitions            metric is not a supported aggregate
feature_adoption               metric is not a supported aggregate
app_health                     metric is not a supported aggregate
pipeline_meal_conversion       metric is not a supported aggregate
ingredient_demand              metric is not a supported aggregate
ingredient_mappings            metric is not a supported aggregate
corpus_reverse_lookup          metric is not a supported aggregate
ingredient_gaps                metric is not a supported aggregate
ingredient_rank_distribution   metric is not a supported aggregate
```

This is a deployment-version defect, not absence of eligible data. Observe pages correctly render these failures as **Unavailable** instead of inventing zeros. The same run also confirmed that legacy Diagnose data remains available: Trace showed 128 activity rows, 240 meal records, 309 AI calls and 12 retention cohorts; Retrieval showed a 96.9% latest match rate; Coverage showed 20 ranked foods, 30 gap queries and 122 quality flags.

The E2E suite deliberately did **not** click **Run snapshot**. That action can invoke Glue and consume the capped Learner Lab budget. Its founder visibility and guard copy were verified without starting a run.

## 5. Why Diagnose took so long

The delay was a protective waterfall, not a database scan in the browser:

```text
Diagnose route
  → Next.js server
    → API Gateway authorizer (reserved concurrency 2)
      → metrics Lambda (reserved concurrency 2)
        → DynamoDB Query
```

To remain inside the API Gateway rate limit and keep reads predictable, the server waits 500 ms between metric requests. The minimum intentional spacing is therefore:

| Route | Before | After | Minimum spacing before network/cold-start time |
|---|---:|---:|---:|
| Pipeline overview | 13 reads | 3 reads | 1.0 s |
| Retrieval & matching | 13 reads | 3 reads | 1.0 s |
| Coverage & corpus | 13 reads | 3 reads | 1.0 s |
| Trace viewer | 13 reads | 13 reads | 6.0 s |

Trace remains the slowest uncached route by design because it verifies every legacy serving contract. A batch API could remove the waterfall, but it would expand the locked AWS API and Lambda implementation for limited assessment value. Page-scoped reads plus caching are the lower-risk fix.

## 6. Data readiness sequence

The Observe panels become populated only when all of these conditions are true:

1. Kallo's reduced operational-analytics migration is applied to the intended Supabase project.
2. Supabase exposes the `analytics` schema and the restricted `analytics_reader` token can select all six allowlisted views.
3. The AWS extractor, Glue transform, loader, and metrics API are deployed from the same 13-metric revision.
4. A new extract → Glue → loader run reaches `completed`.
5. DynamoDB contains the new metric families for the new loader date.
6. Vercel/ECS runs the matching dashboard revision and its five-minute metric cache has refreshed.
7. The selected 7/30/90-day window contains eligible rows. App health requires emitted health events; ingredient intelligence requires persisted decision rows.

Until those steps are complete, populated metrics from an older snapshot and empty newer panels can be a valid transitional state.

## 7. Verification evidence

The following are real commands and outputs from this remediation. No secret values were printed.

### Dashboard type check

```text
$ cd dashboard && npm run typecheck
> kallo-analytics-dashboard@1.0.0 typecheck
> tsc --noEmit

exit 0
```

### Dashboard production build

```text
$ cd dashboard && npm run build
✓ Compiled successfully in 8.0s
✓ Generating static pages (16/16)
Route output included dynamic /coverage, /pipeline, /retrieval and /trace routes.
exit 0
```

Next.js also reported a non-fatal workspace-root warning because `/Users/khoivo/bun.lock` and this dashboard's `package-lock.json` both exist. It did not affect compilation or route generation.

### Python tests

The first documented command failed during collection:

```text
$ pytest -q
E   ModuleNotFoundError: No module named 'lambdas'
2 errors in 0.66s
```

After fixing `pytest.ini`, the same command produced:

```text
$ pytest -q
........................................................................ [ 90%]
........                                                                 [100%]
80 passed in 0.58s
```

### Final Vercel deployment and request-trace contract

```text
$ vercel --prod --yes
Production: https://kallo-aws-analytics-hlcf6nm20-vominhkhoiis-projects.vercel.app
Aliased: https://kallo-aws-analytics.vercel.app
exit 0

$ vercel inspect https://kallo-aws-analytics-hlcf6nm20-vominhkhoiis-projects.vercel.app
id      dpl_FG67NNWXm4JewXHTH2RCd3aSthBo
target  production
status  Ready
```

The authenticated production trace probe printed status and row counts only; no credential or request UUID was printed:

```json
{"loginStatus":200,"requestListStatus":200,"traceDetailStatus":200,"traceRequestMatched":true,"stageCount":4,"ingredientDecisionCount":2,"tracePageStatus":200,"tracePageConsumesRequest":true,"secretValuesPrinted":false}
```

### CloudFormation and diff hygiene

```text
$ cfn-lint infra/*.yaml
exit 0

$ git diff --check -- <changed dashboard, documentation, pytest and Supabase README files>
exit 0
```

### Earlier expired-session boundary

The read-only identity and stack checks previously returned the real AWS error:

```text
An error occurred (ExpiredToken) when calling the GetCallerIdentity operation: The security token included in the request is expired
An error occurred (ExpiredToken) when calling the DescribeStacks operation: The security token included in the request is expired
```

Per the deployment safety rules, those calls were not retried blindly. Credentials were later renewed, and the 5 September validation above supersedes this historical boundary for the current 13-metric AWS revision.

## 8. Residual risks and decisions

- The repository is currently a dirty working tree containing broader product-analytics work. This remediation is uncommitted and unpushed.
- A five-minute server cache can temporarily preserve a per-metric error after a backend deployment. This is a deliberate cost/reliability trade-off; use a fresh deployment or wait for revalidation during evidence capture.
- The AWS data plane and Vercel dashboard are current, but the corresponding source and documentation changes remain uncommitted and unpushed.
- Trace's 13-contract cold path remains intentionally serial and is the slowest Diagnose route; the five-minute server cache makes subsequent reads faster.
- Request-ID search and request-specific Trace rendering are deployed and re-verified against a real bounded trace. The raw RPC payload is intentionally not rendered.
- The fixed Athena APIs and three Glue catalog tables exist in source, but the dashboard still has no Athena query/polling control.
- The AWS presentation stack must remain deleted outside a short assessment evidence session because the ALB and Fargate task bill while running.

## 9. Production-validation result

The remediation is deployed and validated. The final checks verified:

- the expected data stack update completed without creating IAM resources;
- the 13 metric families expected by the current transform are available for the latest loader date;
- Today, AI, Ingredients, System, Pipeline, Trace, Retrieval, and Coverage open without source errors;
- failure, empty, and populated states are visually distinct; and
- the disposable presentation stack, if used for evidence, was deleted afterward.
