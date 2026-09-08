// Kallo × AWS — two repos, three platforms (deployment topology).
// Adapted from examples/multicloud/build_multicloud.mjs: each platform (laptop, GCP+Supabase prod,
// AWS Learner Lab) is its OWN sibling top-level frame; cross-platform arrows carry the deploy story.
// Layout engine only — NO hand-written coordinates. Run: node build-topology.mjs
import { writeFileSync } from "node:fs";
import { Diagram } from "/Users/khoivo/.nvm/versions/node/v22.12.0/lib/node_modules/drawio-ai-kit/src/builder.mjs";
import { group, frame, grid, icon, box, phantom, renderTree } from "/Users/khoivo/.nvm/versions/node/v22.12.0/lib/node_modules/drawio-ai-kit/src/layout-engine.mjs";

const d = new Diagram("hybrid");

// ZONE 1 — Developer laptop (two git repos)
const laptop = frame("laptop", "Developer laptop (two git repos)", { dir: "col", gap: 16, align: "top", stroke: "#5A6B7B" }, [
  frame("repo_kallo", "Kallo (product repo)", { dir: "col", gap: 8, stroke: "#8C9BAB" }, [
    icon("kallo_git", "git_repository", ""),
    box("kallo_sub", "Next.js app · AI pipeline · supabase migrations", { w: 220, h: 34 }),
  ]),
  frame("repo_assign", "kallo-aws-analytics (assignment repo)", { dir: "col", gap: 8, stroke: "#ED7100", bold: true }, [
    icon("assign_git", "git_repository", ""),
    box("assign_sub", "CloudFormation · Lambdas · Glue · dashboard · scripts", { w: 240, h: 34 }),
    box("ops", "operator scripts\ndeploy-data-stack.sh · push-image.sh · lab-up/down.sh", { w: 240, h: 44, fill: "#FFF4E6", stroke: "#ED7100" }),
  ]),
]);

// ZONE 2 — Production (GCP + Supabase) — existing product with a narrow read-only boundary.
const prod = frame("prod", "Production (GCP + Supabase)", { dir: "col", gap: 16, stroke: "#5A6B7B" }, [
  icon("cloudrun", "gcp_cloud_run", "GCP Cloud Run (Kallo app)"),
  frame("supa_box", "Supabase Postgres", { dir: "col", gap: 8, stroke: "#3FCF8E" }, [
    icon("supabase", "supabase", ""),
    box("supa_note", "6 sanitized read-only views\nAI runs · macros · app health · ingredient quality", { w: 260, h: 46, fill: "#E9F9F1", stroke: "#3FCF8E" }),
    box("privacy_note", "No funnels, retention, journeys, or user-level reporting", { w: 260, h: 34, fill: "#F7F4EF", stroke: "#8C9BAB" }),
  ]),
]);

// Continuous dashboard host — used for product iteration while AWS presentation stays disposable.
const vercel = frame("vercel", "Vercel production (continuous dashboard)", { dir: "col", gap: 12, stroke: "#232F3E" }, [
  box("vercel_app", "Next.js operator console\nfounder + reviewer sessions", { w: 230, h: 46, bold: true }),
  box("vercel_note", "DAU/WAU context · app health · AI pipeline\ningredient/corpus quality", { w: 250, h: 46 }),
  box("vercel_cost", "Continuous host · deployed from assignment repo\nno AWS presentation billing", { w: 250, h: 42 }),
]);

// ZONE 3 — AWS Academy Learner Lab
const aws = group("aws", "group_aws_cloud_alt", "AWS Academy Learner Lab (us-east-1) · $50 budget", { dir: "row", gap: 60, align: "top" }, [
  phantom("deploycol", "", { dir: "col", gap: 40, align: "left", header: 0 }, [
    icon("ecr", "ecr", "Amazon ECR\n(dashboard image)"),
    icon("cfn", "cloudformation", "CloudFormation"),
  ]),
  phantom("stackscol", "", { dir: "col", gap: 40, align: "left", header: 0 }, [
    frame("data_stack", "data stack (persistent · pennies)", { dir: "col", gap: 10, stroke: "#7AA116" }, [
      grid("data_grid", null, "", { cols: 4, gap: 14, pad: 4 }, [
        icon("s3", "s3", "S3"),
        icon("ddb", "dynamodb", "DynamoDB"),
        icon("glue", "glue", "Glue"),
        icon("athena", "athena", "Athena"),
        icon("lambda", "lambda", "Lambdas"),
        icon("apigw", "api_gateway", "API GW"),
        icon("evb", "eventbridge", "EventBridge"),
        icon("secrets", "secrets_manager", "Secrets"),
      ]),
      box("runtime_contract", "13 operational aggregates\nDAU/WAU · health · AI latency/failures/cost · match/macros/corpus", { w: 380, h: 46, fill: "#FFF4E6", stroke: "#ED7100", bold: true }),
      box("serving_guardrails", "API guardrails: TOKEN auth cached 300 s · metrics + authorizer concurrency 2 each\nLambda reserved concurrency: 9 / 10 account total", { w: 430, h: 46, fill: "#F7F4EF", stroke: "#8C9BAB" }),
    ]),
    frame("pres_stack", "presentation stack (disposable · per work session)", { dir: "row", gap: 20, stroke: "#8C4FFF" }, [
      icon("alb", "application_load_balancer", "ALB"),
      icon("fargate", "fargate", "ECS Fargate"),
      icon("authsecrets", "secrets_manager", "5 login secrets"),
      box("pres_note", "API Gateway + cached Supabase RPCs\nshared restricted secret · assessment evidence only", { w: 260, h: 46 }),
    ]),
  ]),
]);

const tutor = icon("tutor", "user", "tutor demo\nVercel normally · ALB for evidence");

const tree = frame("root", "Kallo × AWS — two repos, three platforms (deployment topology)", { dir: "row", gap: 90, align: "top" }, [
  laptop,
  phantom("platforms", "", { dir: "col", gap: 42, align: "left", header: 0 }, [
    phantom("continuous_hosts", "", { dir: "row", gap: 42, align: "top", header: 0 }, [prod, vercel, tutor]),
    aws,
  ]),
]);
renderTree(d, tree, [40, 70]);

// Cross-platform deploy story
d.link("repo_kallo", "cloudrun", "existing CI/CD");
d.link("repo_assign", "supa_box", "0001_analytics_schema.sql", { dash: true });
d.link("ops", "cfn", "aws cloudformation deploy", { dir: "LR" });
d.link("ops", "ecr", "docker push · session creds", { dir: "LR" });
d.link("cfn", "data_stack", "creates", { dash: true });
d.link("cfn", "pres_stack", "creates / deletes per session", { dash: true, route: { es: "B", en: "L", kind: "Lvh" } });
d.link("supa_box", "data_stack", "daily extract · HTTPS, read-only views", { flow: true, dir: "TB" });
d.link("vercel", "supa_box", "cached read-only RPCs", { dash: true });
d.link("vercel", "data_stack", "API Gateway · server-held bearer", { flow: true });
d.link("tutor", "vercel", "normal testing URL");

const res = d.validate();
console.log("VALIDATE:", JSON.stringify({ ok: res.ok, errors: res.errors, warnings: res.warnings, advice: res.audit.advice }));
writeFileSync(new URL("./kallo-cross-platform-topology.drawio", import.meta.url), d.mxfile("Kallo × AWS — two repos, three platforms (deployment topology)"));

// Self-check tail (added by `drawio-ai scaffold`): one run = build + validate + render + issues.
import { execFileSync as __exec } from "node:child_process";
try {
  const __f = new URL("./kallo-cross-platform-topology.drawio", import.meta.url).pathname;
  const __png = new URL("./kallo-cross-platform-topology.png", import.meta.url).pathname;
  console.log(__exec("drawio-ai", ["render", __f, "--check", "--page", "1", "-o", __png], { encoding: "utf8" }).trim());
} catch (e) { console.error("RENDER-SKIPPED:", String(e.message).split("\n")[0]); }
