# Assessment 3 submission layout

## Required ZIP structure

Use a neutral filename such as `s<StudentNumber>_assessment3.zip`. Build the ZIP from a clean staging directory, not from the repository root, so dependencies, caches, secrets and Git history are not included.

```text
s<StudentNumber>_assessment3.zip
├── solution-architecture.pdf
├── doc_images/
│   ├── architecture-diagram.png
│   └── <real deployment and dashboard screenshots only>
├── code/
│   ├── lambdas/
│   │   ├── extract/
│   │   ├── loader/
│   │   ├── api/
│   │   └── authorizer/
│   ├── glue/
│   └── dashboard/
├── deploy/
│   ├── infra/
│   │   ├── data-stack.yaml
│   │   ├── presentation-stack.yaml
│   │   ├── probe-stack.yaml
│   │   └── README.md
│   └── scripts/
│       ├── deploy-data-stack.sh
│       ├── push-image.sh
│       ├── lab-up.sh
│       ├── lab-down.sh
│       └── README.md
└── data/
    └── 0001_analytics_schema.sql
```

The tree above is a packaging target, not a statement that screenshots already exist. At the time this guide was written, `docs/doc_images/` contained no captured evidence.

## Placement checklist

### Root document

- [ ] Export `docs/solution-architecture.md` to `solution-architecture.pdf` after replacing only genuine placeholders (student details, repository URL and demonstrated live URL).
- [ ] Check the PDF page by page: Mermaid diagram readable at normal zoom, tables not clipped, code blocks wrapped, links active and IEEE references complete.
- [ ] Do not put `tutor-reproposal.md` into the ZIP unless the submission instructions or tutor explicitly request it; it is correspondence, not the graded architecture document.
- [ ] Do not include this packaging guide unless a contents/readme file is permitted.

### `doc_images/`

- [ ] Include a high-resolution export of the final architecture diagram as `architecture-diagram.png` if the PDF renderer does not render Mermaid reliably.
- [ ] Include only screenshots captured from a real deployment. Useful evidence, once genuinely obtained, includes the permanent dashboard URL, the ALB-served dashboard, a successful manual run and completed poll state, S3 prefixes/manifest, a successful Glue run, DynamoDB aggregate items, EventBridge rules, API routes, Cloud Monitoring System charts, and the Learner Lab budget view.
- [ ] Give screenshots descriptive names and refer to each one from the PDF; remove unused images.
- [ ] Redact account IDs where required and always redact bearer tokens, Supabase keys, Google service-account material, secret values, JWTs, raw user identifiers and the analytics pepper.
- [ ] Do not manufacture screenshots or insert the current live-URL placeholder as if it were deployment evidence.

### `code/`

- [ ] Copy `lambdas/` with handlers, core modules and tests.
- [ ] Copy `glue/job.py`, `glue/transforms.py` and `glue/tests/`.
- [ ] Copy the dashboard source, mock fixtures, `Dockerfile`, `package.json`, lockfile, TypeScript/Next/PostCSS configuration and `.env.example`.
- [ ] Retain source comments and tests needed for the live code defence.
- [ ] Exclude `dashboard/node_modules/`, `dashboard/.next/`, `tsconfig.tsbuildinfo`, `__pycache__/`, `*.pyc`, `.pytest_cache/`, `.ruff_cache/`, coverage output and local editor files.
- [ ] Exclude `.env`, `.lab-config`, ZIP build directories, generated images not used in the report, and every secret or credential.

### `deploy/`

- [ ] Copy all three CloudFormation templates and `infra/README.md` into `deploy/infra/`.
- [ ] Copy the four deployment/lifecycle scripts and `scripts/README.md` into `deploy/scripts/`.
- [ ] Preserve executable permissions on `.sh` files if the ZIP tool supports them.
- [ ] Confirm the templates contain no `AWS::IAM::Role` or `AWS::IAM::Policy`, no NAT Gateway, and the required Glue/Lambda/API cost guards.
- [ ] Before describing the deployment as working, redeploy with fresh Learner Lab credentials and capture real extract, Glue, load, API, Cloud Monitoring, and ECS/ALB evidence.

### `data/`

- [ ] Copy `supabase/migrations/0001_analytics_schema.sql` to `data/0001_analytics_schema.sql`.
- [ ] Ensure the committed placeholder pepper remains a placeholder. Never export the real `analytics.pepper` value.
- [ ] Do not include a production database dump, raw extracts, private aggregate data, Google credentials, or any other user-derived dataset.
- [ ] If sample data is explicitly required, use only the repository's synthetic/sanitised JSONL test fixtures and label them as test fixtures, not public or production data.

## Final pre-submission checks

- [ ] Replace `[repository URL to be inserted before submission]` only after the repository is accessible to the marker.
- [ ] Use the permanent Vercel URL as the living submission link. Present the ALB DNS separately as session-specific AWS deployment evidence.
- [ ] Run the Python tests and the dashboard production build from a clean checkout.
- [ ] Validate all CloudFormation templates and compare packaged files with the committed versions.
- [ ] Open the final ZIP in a new temporary directory and verify the exact top-level folders and PDF.
- [ ] Search the unpacked submission for likely secret names and values before upload.
- [ ] Record a checksum of the final ZIP and keep an identical local copy of the submitted artefact.
