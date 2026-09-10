// Kallo Analytics Plane — current runtime architecture. Layout engine only; no hand-written coordinates.
import { writeFileSync } from "node:fs";
import { execFileSync as execFile } from "node:child_process";
import { Diagram } from "/Users/khoivo/.nvm/versions/node/v22.12.0/lib/node_modules/drawio-ai-kit/src/builder.mjs";
import { group, frame, grid, icon, box, phantom, onpremFrame, ossBox, renderTree } from "/Users/khoivo/.nvm/versions/node/v22.12.0/lib/node_modules/drawio-ai-kit/src/layout-engine.mjs";

const d = new Diagram("pipeline");

const tree = phantom("root", "", { dir: "row", gap: 48, align: "center", header: 0, pad: 10 }, [
  phantom("external", "", { dir: "col", gap: 56, align: "center", header: 0, pad: 0 }, [
    onpremFrame("production", "PRODUCTION — GOOGLE CLOUD + SUPABASE", [
      grid("prod_grid", null, "", { cols: 4, gap: 18, pad: 4 }, [
        icon("cloudrun", "gcp_cloud_run", "Kallo app\nCloud Run"),
        icon("supabase", "supabase", "Supabase\nPostgres + RPC"),
        icon("logging", "gcp_cloud_logging", "Cloud Logging\nrequest logs"),
        icon("gcm", "gcp_cloud_monitoring", "Cloud Monitoring\nbuilt-in runtime metrics"),
      ]),
      box("privacy", "Bounded exact-trace RPC · request logs reduced to hourly histograms\nNo user/session identifiers, prompts, wire responses, raw logs, or URLs stored in AWS", { fs: 10, bold: true }),
    ], { dir: "col", gap: 16, align: "center" }),
    frame("permanent", "PERMANENT LINK", { dir: "col", gap: 16, align: "center", stroke: "#232F3E" }, [
      ossBox("vercel", "Vercel production\ncontinuous Next.js dashboard", { bold: true }),
      box("host_contract", "Same server-side AWS API path\nDirect Supabase RPC for exact traces + raw meal text", { fs: 10 }),
    ]),
    icon("operator", "user", "Operator / tutor"),
  ]),

  group("aws", "group_aws_cloud_alt", "AWS ACADEMY LEARNER LAB — us-east-1", { dir: "col", gap: 42, align: "start" }, [
    frame("etl", "DAILY + MANUAL DOMAIN SNAPSHOT", { dir: "row", gap: 34, align: "center" }, [
      icon("schedule", "eventbridge_scheduler", "EventBridge\nschedule"),
      icon("extract", "lambda", "Extract\nLambda"),
      icon("s3", "s3", "S3\nraw + curated + aggregates"),
      icon("glue", "glue", "Glue ETL\ntransform + aggregate"),
      icon("success", "eventbridge", "Glue success\nrule"),
      icon("loader", "lambda", "Loader\nLambda"),
      icon("ddb", "dynamodb", "DynamoDB\naggregates + route histograms"),
    ]),

    frame("serving", "DASHBOARD SERVING + OBSERVABILITY", { dir: "row", gap: 34, align: "center" }, [
      group("vpc", "group_vpc", "Default VPC", { dir: "row", gap: 18, align: "center" }, [
        group("public", "group_subnet", "Public subnets", { dir: "row", gap: 40, align: "center" }, [
          icon("alb", "application_load_balancer", "ALB\ndisposable · off"),
          icon("fargate", "fargate", "ECS Fargate\nassessment dashboard"),
        ]),
      ]),
      icon("route_schedule", "eventbridge_scheduler", "Route ingest\nevery 5 min"),
      icon("apigw", "api_gateway", "API Gateway\nTOKEN authorizer"),
      grid("api_functions", null, "Lambda API handlers", { cols: 2, gap: 20, pad: 12 }, [
        icon("metrics", "lambda", "Metrics + runs"),
        icon("monitoring", "lambda", "Google observability\ncollector"),
      ]),
    ]),

    frame("controls", "CROSS-CUTTING CONTROLS", { dir: "row", gap: 52, align: "center" }, [
      icon("ecr", "ecr", "ECR\ndashboard image"),
      icon("secrets", "secrets_manager", "Secrets Manager\nSupabase · GCP reader · bearer"),
      icon("cloudwatch", "cloudwatch_2", "CloudWatch\nlogs + AWS metrics"),
      box("guardrails", "Reserved Lambda concurrency 8 / 10 · API rate 2 r/s, burst 5\nGlue 2 × G.1X, 10 min, no retries · route TTL 32 d · Monitoring cache 120 s", { fs: 10, bold: true }),
    ]),
  ]),
]);

renderTree(d, tree, [40, 84]);
d.title("Kallo Analytics Plane — runtime architecture");

d.link("schedule", "extract", "invoke", { flow: true });
d.link("supabase", "extract", "sanitized views", { flow: true });
d.link("extract", "s3", "JSONL + manifest", { flow: true });
d.link("extract", "glue", "StartJobRun", { dash: true });
d.link("s3", "glue", "read raw", { flow: true });
d.link("glue", "s3", "Parquet + JSON", { flow: true });
d.link("glue", "success", "SUCCEEDED", { dash: true });
d.link("success", "loader", "invoke");
d.link("loader", "ddb", "idempotent upserts", { flow: true });

d.link("operator", "alb", "assessment session", { dash: true });
d.link("alb", "fargate", "forward");
d.link("fargate", "apigw", "server-held bearer", { flow: true });
d.link("vercel", "apigw", "server-held bearer", { flow: true });
d.link("apigw", "api_functions", "authorize + invoke");
d.link("metrics", "ddb", "aggregate reads");
d.link("route_schedule", "monitoring", "invoke / 5 min", { dash: true });
d.link("monitoring", "gcm", "Monitoring API read", { dash: true });
d.link("monitoring", "logging", "Logging API read", { dash: true });
d.link("monitoring", "ddb", "histograms + cache", { flow: true });
d.link("cloudrun", "logging", "automatic request logs", { dash: true });
d.link("cloudrun", "gcm", "built-in runtime metrics", { dash: true });
d.link("fargate", "supabase", "exact-trace RPC", { dash: true });
d.link("vercel", "supabase", "exact-trace RPC", { dash: true });
d.link("operator", "vercel", "permanent link");

d.link("ecr", "fargate", "image pull", { dash: true });
d.link("secrets", "api_functions", "runtime secrets", { dash: true });
d.link("cloudwatch", "api_functions", "logs", { dash: true });

const result = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: result.ok, errors: result.errors, warnings: result.warnings, advice: result.audit.advice }));
const output = new URL("./kallo-analytics-architecture.drawio", import.meta.url);
writeFileSync(output, d.mxfile("Kallo Analytics Plane"));
try {
  console.log(execFile("drawio-ai", ["render", output.pathname, "--check", "--page", "1", "-o", output.pathname + ".png"], { encoding: "utf8" }).trim());
} catch (error) {
  console.error("RENDER-SKIPPED:", String(error.message).split("\n")[0]);
}
