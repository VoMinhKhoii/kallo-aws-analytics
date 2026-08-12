// Kallo Analytics Plane — runtime architecture (AWS Academy Learner Lab). NO hardcoded coords.
// Production (GCP + Supabase) → AWS Learner Lab ETL (EventBridge → Lambda → S3 → Glue → DynamoDB)
// → serving (Athena · API Gateway · Lambda) → dashboard (ALB → ECS Fargate) ← operator.
import { writeFileSync } from "node:fs";
import { Diagram } from "/Users/khoivo/.nvm/versions/node/v22.12.0/lib/node_modules/drawio-ai-kit/src/builder.mjs";
import { group, frame, grid, icon, box, phantom, onpremFrame, ossBox, renderTree } from "/Users/khoivo/.nvm/versions/node/v22.12.0/lib/node_modules/drawio-ai-kit/src/layout-engine.mjs";

const d = new Diagram("pipeline");

const tree = phantom("root", "", { dir: "row", gap: 56, align: "center", header: 0, pad: 10 }, [
  // ---- external column (left): production zone + operator ----
  phantom("ext", "", { dir: "col", gap: 90, align: "center", header: 0, pad: 0 }, [
    onpremFrame("prod", "PRODUCTION — GCP + Supabase", [
      icon("kallo", "gcp_cloud_run", "Kallo app (Cloud Run)"),
      icon("supabase", "generic_database", "Supabase Postgres"),
      box("sbnote", "analytics schema: 7 sanitized\nread-only views\nHMAC'd IDs · column allowlists", { fs: 10 }),
    ], { dir: "col", gap: 20, align: "center" }),
    icon("operator", "user", "Operator / tutor (browser)"),
  ]),

  // ---- AWS Learner Lab (main zone) ----
  group("aws", "group_aws_cloud_alt", "AWS Learner Lab (us-east-1)", { dir: "row", gap: 70, align: "center" }, [
    phantom("lanes", "", { dir: "col", gap: 110, align: "start", header: 0, pad: 0 }, [
    // Lane 1 — ETL, strictly left→right: extract → S3 → Glue → SUCCEEDED rule → loader
    phantom("etl", "", { dir: "row", gap: 100, align: "center", header: 0, pad: 0 }, [
      phantom("extractcl", "", { dir: "row", gap: 56, align: "center", header: 0, pad: 0 }, [
        phantom("trigcol", "", { dir: "col", gap: 76, align: "center", header: 0, pad: 0 }, [
          icon("evb_daily", "eventbridge_scheduler", "EventBridge daily rule"),
          icon("secrets", "secrets_manager", "Secrets Manager"),
        ]),
        icon("lambda_extract", "lambda", "Lambda extract"),
      ]),
      phantom("lake", "", { dir: "col", gap: 14, align: "center", header: 0, pad: 0 }, [
        icon("s3", "s3", ""),
        box("s3note", "S3 data lake\nraw/ · curated/ · aggregates/ · manifests", { fs: 10, bold: true }),
      ]),
      icon("glue", "glue", "Glue job (PySpark · 2 workers)"),
      icon("evb_succ", "eventbridge", "Rule: Glue SUCCEEDED"),
      icon("lambda_loader", "lambda", "Lambda loader"),
    ]),
    // Lane 2 — serving, left→right: ALB → Fargate → API Gateway → api handlers
    phantom("serve", "", { dir: "row", gap: 90, align: "center", header: 0, pad: 0 }, [
      group("vpc", "group_vpc", "Default VPC", { dir: "row", gap: 24, align: "center" }, [
        group("pubsub", "group_subnet", "Public subnets", { dir: "row", gap: 40, align: "center" }, [
          icon("alb", "application_load_balancer", "Application Load Balancer"),
          icon("dashboard", "fargate", "ECS Fargate — Next.js dashboard"),
        ]),
      ]),
      phantom("gwcol", "", { dir: "col", gap: 56, align: "center", header: 0, pad: 0 }, [
        icon("ecr", "ecr", "ECR (dashboard image)"),
        icon("apigw", "api_gateway", "API Gateway (REST)\nTOKEN authorizer"),
      ]),
      phantom("apicol", "", { dir: "col", gap: 90, align: "center", header: 0, pad: 0 }, [
        icon("athena", "athena", "Athena workgroup · byte cap"),
        icon("lambda_api", "lambda", "Lambda api handlers"),
      ]),
    ]),
    ]),
    // Convergence sink — fed by loader (lane 1) and api handlers (lane 2)
    icon("ddb", "dynamodb", "DynamoDB \"aggregates\"\nPK metric · SK date"),
  ]),

  // ---- external AI (right) ----
  ossBox("gemini", "Google Gemini API\n(external)", { bold: true }),
]);

renderTree(d, tree, [40, 90]);
d.title("Kallo Analytics Plane — runtime architecture (AWS Academy Learner Lab)");

// production zone
d.link("kallo", "supabase", "writes");
// lane 1 — extract
d.link("evb_daily", "lambda_extract", "invoke daily", { dir: "LR" });
d.link("supabase", "lambda_extract", "HTTPS PostgREST · watermarked pulls");
d.link("secrets", "lambda_extract", "read creds", { dash: true, dir: "LR" });
d.link("lambda_extract", "s3", "write JSON Lines", { flow: true });
d.link("lambda_extract", "glue", "StartJobRun ×1");
// lane 1 — transform
d.link("s3", "glue", "read raw", { flow: true });
d.link("glue", "s3", "write Parquet + aggregates", { flow: true });
// lane 1 — load
d.link("glue", "evb_succ", "SUCCEEDED", { dash: true });
d.link("evb_succ", "lambda_loader", "invoke");
d.link("lambda_loader", "ddb", "idempotent upserts", { flow: true });
// lane 2 — serving
d.link("operator", "alb", "HTTPS");
d.link("alb", "dashboard", "forward");
d.link("ecr", "dashboard", "image pull", { dash: true });
d.link("dashboard", "apigw", "Bearer · server-side");
d.link("apigw", "lambda_api", "invoke");
d.link("lambda_api", "athena", "start/poll queries", { dir: "LR" });
d.link("athena", "s3note", "query curated Parquet", { dash: true });
d.link("lambda_api", "ddb", "read aggregates");
d.link("lambda_api", "gemini", "generateContent");

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("./kallo-analytics-architecture.drawio", import.meta.url), d.mxfile("Kallo Analytics Plane"));

// Self-check tail (added by `drawio-ai scaffold`): one run = build + validate + render + issues.
import { execFileSync as __exec } from "node:child_process";
try {
  const __f = new URL("./kallo-analytics-architecture.drawio", import.meta.url).pathname;
  console.log(__exec("drawio-ai", ["render", __f, "--check", "-o", __f + ".png"], { encoding: "utf8" }).trim());
} catch (e) { console.error("RENDER-SKIPPED:", String(e.message).split("\n")[0]); }
