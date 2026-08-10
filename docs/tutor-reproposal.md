# Re-proposal: Kallo Analytics Plane on AWS

**To:** Dr Ginel  
**Subject:** Assessment 3 service changes and request for written rubric confirmation

Dear Dr Ginel,

I am writing to confirm three service changes since my email proposal. The objective is unchanged: an AWS analytics plane for `kallo.fit` that does not add reporting load to its Google Cloud Run/Supabase production path.

## What changed

| Earlier proposal | Current design | Reason |
|---|---|---|
| CloudFront | **ALB** before one ECS Fargate task | CloudFront is unavailable in Learner Lab. ALB supports ECS `awsvpc` IP targets, provides a demonstration DNS name and is removed with the disposable presentation stack. |
| Amazon RDS | **DynamoDB on-demand**, keyed by `metric` and `date` | The workload needs exact run/watermark lookups and metric/date ranges, not joins. Pay per request avoids an idle relational instance under the USD 50 budget; Athena remains the relational query path. |
| Amazon EMR | **AWS Glue** (justification unchanged) | Managed Spark avoids cluster provisioning and idle EC2 capacity. The daily job is limited to two G.1X workers, ten minutes, no retries and one concurrent run. |

## Service-to-marks mapping

| Rubric area | Marks | Project evidence / services |
|---|---:|---|
| Links and summary | 0.5 | Temporary ALB DNS, repository link, objective, no public dataset. |
| Introduction | 1.0 | Production isolation, cross-cloud overview and beneficiaries. |
| Related work | 1.0 | PostHog, BigQuery/Looker Studio, AWS serverless data lakes and Kimball ETL. |
| System architecture | 5.0 | CloudFormation; S3; Lambda; Glue/Catalog; EventBridge; DynamoDB; Athena; API Gateway; Secrets Manager; ECR; ECS/Fargate; ALB; VPC; CloudWatch. Labelled diagram, operation sequences, choices and automation evidence. |
| System descriptions | 1.0 | Responsibilities and boundaries across source, pipeline, APIs and presentation. |
| Datasets, structures and APIs | 1.0 | Seven views, privacy controls, S3/DynamoDB layouts, PostgREST and Gemini. |
| References | 0.5 | IEEE-numbered primary and comparable-system sources. |
| **Total** | **10.0** | |

The report will claim only evidence I can demonstrate. It will disclose that Athena catalogue tables and a dashboard Athena control are not yet implemented, and that the ECS/ALB target port currently differs from the container's listening port.

Could you please confirm in writing that this mapping—and specifically ALB for unavailable CloudFront, DynamoDB for RDS, and Glue for EMR—matches the Assessment 3 rubric? If a named service must remain for marking, I would appreciate clarification before final deployment.

Kind regards,  
`[Student name]`  
`[Student number]`
