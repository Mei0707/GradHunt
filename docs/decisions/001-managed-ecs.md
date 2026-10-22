# GradHunt deployment decision: new managed ECS Fargate service

Status: selected on 2026-10-22; runtime prerequisite incomplete. No AWS resources have been provisioned.

## Decision and verified target

Use `mode: managed` for a new `GradHunt-production` stack in the configured AWS account and `us-west-2` region. STS verified the account identity, local AWS configuration selected the region, ECS reported no clusters there, and availability-zone discovery verified `us-west-2a` and `us-west-2b`. There is no verified existing ECS service to import.

Use `publicEndpoint: cloudfront`: CloudFront supplies an AWS-provided `*.cloudfront.net` HTTPS address and connects to an internal ALB through a VPC origin. No purchased domain, Route 53 zone or separately issued ACM certificate is required. The ALB and gateway tasks remain private. The AWS-managed origin-facing prefix list `pl-82a045eb` was verified in the selected region and limits ALB ingress.

The application remains React/Vite, Express/Node.js, MongoDB and an optional Python agent. Lambda, API Gateway and DynamoDB are not this application's deployment architecture. The optional agent/PostgreSQL service remains separately hosted.

The account-specific draft is `infra/config.production.json`, intentionally ignored by Git. It contains the verified account, region, zones, prefix list and selected architecture. `runtimeSecretArn` is null because no real runtime secret or working database has been established. Example configurations remain offline synthesis fixtures; the deployment entrypoint rejects them.

## Target behavior

CDK will create a VPC, CloudFront distribution and VPC origin, internal ALB, private ECS gateway tasks in two zones, autoscaling, ECR, private S3 uploads, CloudWatch monitoring, SNS topic and GitHub OIDC release role. The frontend is served by the gateway from the same public origin. The distribution permits API methods, forwards headers/cookies/query strings, disables response caching, and does not retain error responses.

The gateway trusts exactly two proxy hops for CloudFront plus ALB; the direct-ALB alternative trusts one. Releases preserve the current proxy settings unless explicitly overridden. CloudFront origin reads are configured for 120 seconds, so longer scraper/agent operations can time out at the edge even while the gateway finishes processing. Edge-only failures require separate CloudFront monitoring in addition to the existing gateway/ALB signals.

The managed stack creates paid resources, including ECS tasks, an ALB, a NAT gateway and CloudFront traffic. It uses one NAT gateway as documented in the availability tradeoffs. No provisioning command was executed as part of this decision.

## Prerequisites and current state

| Item | Verified state | Next step |
| --- | --- | --- |
| Account, region, zones | Verified through STS/AWS metadata | Recorded in the local production config |
| Existing ECS service | No cluster found in the selected region | CDK creates the new managed service |
| Public HTTPS | CloudFront/VPC-origin path implemented and synthesized | AWS assigns the hostname when the distribution is created |
| Custom domain/certificate | None found; not required by the selected mode | Optional later migration to an owned domain |
| MongoDB | Local settings contain an external SRV URI, but a read-only connectivity check returned DNS `ENOTFOUND` | Correct or replace the database connection and verify reachability; do not treat it as production-ready |
| Runtime secret | Secrets Manager inventory is empty in this region | Create a real production secret only after obtaining a working database URI; record its full ARN |
| Email/AI | Local configuration exists; provider operation was not tested | Validate provider settings during deployment smoke testing |
| GitHub OIDC | No existing provider found in the account | Stack can create the provider; configure the exact protected-environment subject and repository variables |

## Deployment checks

From `infra/`:

```sh
npm run preflight -- --config config.production.json
npm run synth -- --quiet --no-lookups -c config=config.production.json
npm run diff -- -c config=config.production.json
npm run deploy -- -c config=config.production.json --outputs-file ../reports/stack-outputs.json
```

Preflight currently reports `Missing runtimeSecretArn`. That is an incomplete deployment configuration. After supplying a real ARN, preflight checks the active account, available zones, AWS-managed CloudFront prefix list, secret existence and OIDC provider reuse. The alternative custom-domain path additionally verifies the issued certificate/domain coverage and optional hosted zone; existing-service mode verifies the real service and task roles.

`npm run deploy` runs preflight before CDK. These checks read metadata and never retrieve secret values. They do not prove database reachability from future task subnets, secret contents, imported-network connectivity, exact GitHub JWT subject or successful public routing. Those remain integration checks in the deployment runbook. Direct CDK invocations bypass the wrapper; use the documented npm command for provisioning.
