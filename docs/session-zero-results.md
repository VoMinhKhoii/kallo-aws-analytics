# Session 0 — permission probe results

**Run:** 2026-08-28, account `902339462666`, `us-east-1`, stack `kallo-probe`.
**Outcome: every assumption held. No plan changes required.**

Session 0 exists because nine of the twenty-five service marks (ECS Fargate 6,
ALB 3) rested on Learner Lab behaviour nobody had tested. Discovering a failure
here costs an afternoon; discovering it in week three costs the architecture.

## What was proven

| Assumption | Evidence | Verdict |
|---|---|---|
| CloudFormation can `PassRole` `LabRole` without creating IAM | Stack reached `CREATE_COMPLETE` with zero IAM resources in the template | Held |
| `LabRole` assumable by Lambda | `ProbeFunction` invoked from the console, returned success | Held |
| Lambda can read Secrets Manager and list S3 under `LabRole` | Same invocation; both calls in the response body | Held |
| `LabRole` assumable by Glue; 2×G.1X available | `ProbeGlueJob` run reached `Succeeded` | Held |
| `LabRole` assumable by EventBridge | `ProbeScheduleRule` + invoke permission created | Held |
| Athena usable with a bytes-scanned cap | `SELECT 1` returned `1` in workgroup `kallo-probe-athena` | Held |
| **Federated session credentials can push to ECR** | `docker push` returned `sha256:26e4536f…`; `list-images` shows the tag | **Held** |
| **`LabRole` can pull that image into Fargate** | `ProbeService` reached `CREATE_COMPLETE` — CFN waits for steady state | **Held** |
| **ALB routes to an `awsvpc` task and reports healthy** | Probe URL served `session-zero probe ok` over HTTP | **Held** |
| Default VPC has two public subnets in different AZs | Six subnets offered; ALB accepted two | Held |

Elapsed: stack created 14:15, container tier complete 14:52, deleted immediately
after. The ALB — the only hourly-billed resource — existed for well under an hour.

## Defects found and fixed during the probe

Three template/doc defects surfaced only because the probe was actually run:

1. **Athena workgroup had no result location.** It set
   `EnforceWorkGroupConfiguration: true`, which makes Athena ignore any
   client-supplied output location — so every query would have failed with
   *"No output location provided."* Fixed by adding a required
   `ProbeAthenaResultsS3Uri` parameter feeding `ResultConfiguration`.
2. **The documented `create-stack` command was unrunnable.** It omitted `VpcId`,
   `PublicSubnetIdOne` and `PublicSubnetIdTwo`, all required with no defaults.
3. **The Glue script the probe requires did not exist.** `ProbeGlueScriptS3Uri`
   was a parameter with nothing to point it at; `infra/probe-glue/probe.py` now
   ships in the repo.

A fourth issue is operational rather than a defect: the probe stack creates no S3
bucket but needs one for the Glue script and Athena results. Now documented as a
prerequisite in `infra/README.md`.

## Operator notes for later sessions

- **Tag with braces.** `docker push $ECR:tag` in zsh silently drops the tag and
  pushes `:latest`, because `:t`/`:s` are zsh parameter modifiers. Use
  `${ECR}:tag`.
- **`--platform linux/amd64` is mandatory** on Apple Silicon. Without it the
  image builds and pushes cleanly, then the task dies with `exec format error`.
- **CloudShell is available** in this lab and comes pre-authenticated, which
  avoids re-pasting credentials. It cannot run Docker, so image pushes stay local.
- **Lab credentials die with the session.** Re-copy the AWS Details block into
  `~/.aws/credentials` at the start of every session.

## Cost

Estimated at well under USD 0.20: one short 2-DPU Glue run dominates, with the
ALB and single Fargate task under an hour and Lambda, Athena (`SELECT 1` scans no
bytes) and ECR storage effectively free. Record the actual delta from the
Vocareum budget readout before and after the session.
