# Infrastructure deployment

All commands assume AWS Academy credentials are active, the current directory is the repository root, and the selected region is `us-east-1`. These templates create no IAM resources: every service role is the pre-existing `LabRole`.

## Parameters and prerequisites

- `ProbeGlueScriptS3Uri`: S3 URI of a trivial uploaded PySpark script; `infra/probe-glue/probe.py` is the one this repo ships.
- `ProbeAthenaResultsS3Uri`: S3 prefix Athena writes results to. Required: the workgroup sets `EnforceWorkGroupConfiguration`, so a client-supplied output location is ignored and a workgroup without one fails every query.
- `GlueScriptS3Uri`: S3 URI of the real analytics PySpark entrypoint. The script object must exist before the data stack is created.
- `SupabaseUrl`, `SupabaseKey`, `GeminiApiKey`, and `DashboardBearerToken`: deployment secrets. Supply real values from shell variables; do not store them in this repository. The bearer token must contain 20–128 characters.
- `ImageUri`: full ECR image URI, including its tag or digest, for a `linux/amd64` dashboard image.
- `VpcId`, `PublicSubnetIdOne`, and `PublicSubnetIdTwo`: the default VPC and two public subnets in different Availability Zones.
- `DataStackName`: exactly the deployed data stack name. The presentation stack uses it to import the API URL and dashboard-token secret ARN.

Set local shell variables without committing their values:

```sh
export PROBE_GLUE_SCRIPT_S3_URI='s3://REPLACE_ME/probe/probe.py'
export PROBE_ATHENA_RESULTS_S3_URI='s3://REPLACE_ME/athena-probe/'
export GLUE_SCRIPT_S3_URI='s3://REPLACE_ME/glue/kallo_etl.py'
export SUPABASE_URL='https://REPLACE_ME.supabase.co'
export SUPABASE_KEY='REPLACE_ME'
export GEMINI_API_KEY='REPLACE_ME'
export DASHBOARD_BEARER_TOKEN='REPLACE_WITH_AT_LEAST_20_CHARACTERS'
export IMAGE_URI='ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/kallo-dashboard:TAG'
export DEFAULT_VPC_ID='vpc-REPLACE_ME'
export PUBLIC_SUBNET_ONE='subnet-REPLACE_ME'
export PUBLIC_SUBNET_TWO='subnet-REPLACE_ME'
```

## Deploy order

**Prerequisite:** the probe stack creates no S3 bucket, but it needs one that
already exists — for the trivial Glue script (`ProbeGlueScriptS3Uri`) and for
Athena results (`PROBE_ATHENA_RESULTS_S3_URI`). Create it once per lab account
before Session 0; the data stack creates its own bucket separately.

```sh
aws s3 mb "s3://kallo-lab-scratch-$(aws sts get-caller-identity --query Account --output text)" --region us-east-1
```


Create the probe first and manually invoke its Lambda, start its Glue job, and run `SELECT 1` in its Athena workgroup. Delete the probe after Session 0. Create the persistent data stack next, then create the disposable presentation stack only for work sessions or demonstrations.

### 1. Create and test the probe stack

Prefer the script — it discovers the VPC and subnets, runs both passes, pushes
the probe image, and waits for ALB target health:

```sh
scripts/session-zero-probe.sh \
  --glue-script-s3-uri "$PROBE_GLUE_SCRIPT_S3_URI" \
  --athena-results-s3-uri "$PROBE_ATHENA_RESULTS_S3_URI"
```

To drive CloudFormation by hand instead, `VpcId`, `PublicSubnetIdOne`, and
`PublicSubnetIdTwo` are required and have no defaults, so they must be supplied:

```sh
aws cloudformation create-stack \
  --stack-name kallo-probe \
  --template-body file://infra/probe-stack.yaml \
  --parameters \
    ParameterKey=VpcId,ParameterValue="$DEFAULT_VPC_ID" \
    ParameterKey=PublicSubnetIdOne,ParameterValue="$PUBLIC_SUBNET_ONE" \
    ParameterKey=PublicSubnetIdTwo,ParameterValue="$PUBLIC_SUBNET_TWO" \
    ParameterKey=ProbeGlueScriptS3Uri,ParameterValue="$PROBE_GLUE_SCRIPT_S3_URI" \
    ParameterKey=ProbeAthenaResultsS3Uri,ParameterValue="$PROBE_ATHENA_RESULTS_S3_URI" \
    ParameterKey=ProbeSecretValue,ParameterValue='session-zero-placeholder' \
  --region us-east-1

aws cloudformation wait stack-create-complete \
  --stack-name kallo-probe \
  --region us-east-1

aws lambda invoke \
  --function-name "$(aws cloudformation describe-stacks --stack-name kallo-probe --region us-east-1 --query 'Stacks[0].Outputs[?OutputKey==`ProbeFunctionName`].OutputValue' --output text)" \
  --region us-east-1 \
  /tmp/kallo-probe-lambda.json

aws glue start-job-run \
  --job-name "$(aws cloudformation describe-stacks --stack-name kallo-probe --region us-east-1 --query 'Stacks[0].Outputs[?OutputKey==`ProbeGlueJobName`].OutputValue' --output text)" \
  --region us-east-1

aws athena start-query-execution \
  --query-string 'SELECT 1' \
  --work-group "$(aws cloudformation describe-stacks --stack-name kallo-probe --region us-east-1 --query 'Stacks[0].Outputs[?OutputKey==`ProbeAthenaWorkGroupName`].OutputValue' --output text)" \
  --region us-east-1
```

The Athena result URI deliberately uses an existing bucket so the minimal probe does not create another storage resource.

Delete the probe after the checks complete:

```sh
aws cloudformation delete-stack \
  --stack-name kallo-probe \
  --region us-east-1

aws cloudformation wait stack-delete-complete \
  --stack-name kallo-probe \
  --region us-east-1
```

### 2. Create the persistent data stack

```sh
aws cloudformation create-stack \
  --stack-name kallo-data \
  --template-body file://infra/data-stack.yaml \
  --parameters \
    ParameterKey=GlueScriptS3Uri,ParameterValue="$GLUE_SCRIPT_S3_URI" \
    ParameterKey=SupabaseUrl,ParameterValue="$SUPABASE_URL" \
    ParameterKey=SupabaseKey,ParameterValue="$SUPABASE_KEY" \
    ParameterKey=GeminiApiKey,ParameterValue="$GEMINI_API_KEY" \
    ParameterKey=DashboardBearerToken,ParameterValue="$DASHBOARD_BEARER_TOKEN" \
  --region us-east-1

aws cloudformation wait stack-create-complete \
  --stack-name kallo-data \
  --region us-east-1
```

Delete the data stack only when its persistent data is no longer required:

```sh
aws cloudformation delete-stack \
  --stack-name kallo-data \
  --region us-east-1

aws cloudformation wait stack-delete-complete \
  --stack-name kallo-data \
  --region us-east-1
```

### 3. Create the disposable presentation stack

```sh
aws cloudformation create-stack \
  --stack-name kallo-presentation \
  --template-body file://infra/presentation-stack.yaml \
  --parameters \
    ParameterKey=ImageUri,ParameterValue="$IMAGE_URI" \
    ParameterKey=VpcId,ParameterValue="$DEFAULT_VPC_ID" \
    ParameterKey=PublicSubnetIdOne,ParameterValue="$PUBLIC_SUBNET_ONE" \
    ParameterKey=PublicSubnetIdTwo,ParameterValue="$PUBLIC_SUBNET_TWO" \
    ParameterKey=DataStackName,ParameterValue='kallo-data' \
  --region us-east-1

aws cloudformation wait stack-create-complete \
  --stack-name kallo-presentation \
  --region us-east-1
```

Delete the presentation stack at the end of every work session. This removes its ALB, listener, target group, security groups, ECS service, task definition, cluster, and log group:

```sh
aws cloudformation delete-stack \
  --stack-name kallo-presentation \
  --region us-east-1

aws cloudformation wait stack-delete-complete \
  --stack-name kallo-presentation \
  --region us-east-1
```

Always delete `kallo-presentation` before `kallo-data`, because the presentation stack imports exports owned by the data stack.
