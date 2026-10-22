# Deployment and release runbook

The selected production target is a **new managed ECS Fargate service in us-west-2**, using a CloudFront HTTPS address and private ALB. See [the deployment decision](../decisions/001-managed-ecs.md) for verified metadata and remaining prerequisites. Existing-service integration remains available when an actual service is identified. Never deploy example account IDs or placeholder service names.

## Identify and configure the target

Read the AWS inventory note in `docs/architecture.md`. In the intended AWS profile/account, find the real cluster, service, task family, task role and execution role. Verify that the gateway container exposes port 3000. Existing service integration requires the ECS rolling deployment controller, spare rolling-update capacity, a stable running service and private task ingress through an ALB. Other hosting types need their own deployment adapter.

Copy `infra/config.example.json` to `infra/config.json` and replace its values. `mode: existing` creates supporting resources and attaches scoped logging, ECR pull and upload permissions to the existing roles. Supply ALB/target-group full names for target and load-balancer alarms. If an OIDC provider already exists in the account, set `oidcProviderArn` to import it. If an upload bucket already exists, set `resumeBucketName`; verify its encryption, public-access block, TLS policy and retention separately.

For the selected domain-free managed service, the ignored `infra/config.production.json` contains the verified account/region/zones and `publicEndpoint: cloudfront`. `infra/config.managed-cloudfront.example.json` is its offline synthesis fixture. CloudFront supplies the public HTTPS hostname, while the ALB remains private and accepts only the regional AWS-managed origin-facing prefix list. Application caching is disabled, all API methods/headers/cookies are forwarded, and gateway proxy trust covers CloudFront plus ALB. No custom domain or ACM certificate is required for this mode. CloudFront origin reads are capped at 120 seconds in this configuration, so longer scraper/agent requests can time out at the edge.

For a managed service with an owned custom domain, use `infra/config.managed.example.json`. Supply a regional ACM certificate, domain and at least two explicit `availabilityZones`; optional `hostedZoneId` and `hostedZoneName` enable the DNS alias. Otherwise create the DNS alias manually using the output ALB DNS name. Optional `vpc` attributes import an existing VPC and its public/private subnet IDs rather than creating a network. Imported subnets must already provide outbound access to MongoDB, S3 and scraper/AI providers.

The exact GitHub `sub` claim must match `githubOidcSubject` and the protected environment. Repositories using immutable OIDC subjects include owner/repository IDs; use that actual subject instead of widening the condition with wildcards. See [GitHub's AWS OIDC guidance](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws).

## Prepare runtime configuration

Managed mode imports a Secrets Manager JSON secret with `MONGODB_URI`, `AUTH_SECRET` (at least 32 random characters), `OPENAI_API_KEY`, `RESEND_API_KEY`, and `EMAIL_FROM`. Optional `agentServiceUrl` also requires `AGENT_SERVICE_TOKEN`. Use an encrypted MongoDB connection with a database-scoped user and configure network access from the task subnets. A customer-managed KMS key on the secret requires an explicit execution-role decrypt grant.

For an existing task, configure the same runtime settings on its current task definition. `MONGODB_URI` and `AUTH_SECRET` must be ECS secret references; the release script refuses plaintext versions. `OPENAI_API_KEY` is necessary for AI features, and verified history depends on working email delivery. Set `AGENT_SERVICE_URL` and its token only when that optional service is hosted and reachable.

Migrate existing raw local uploads into the bucket under `resumes/<existing-storedFileName>` before switching to S3 or increasing task count. Keep the stored filenames so MongoDB references remain valid. Saved resume text/analysis and application history are already in MongoDB. Do not copy secrets or local virtual environments into an image.

## Review and provision infrastructure

From `infra/`:

```sh
npm ci
npm test
npm run preflight -- --config config.production.json
npm run synth -- --quiet --no-lookups -c config=config.production.json
npm run diff -- -c config=config.production.json
npm run deploy -- -c config=config.production.json --outputs-file ../reports/stack-outputs.json
```

The preflight rejects placeholders, missing runtime-secret settings and mismatched AWS accounts. It verifies resource metadata without reading secret values. `npm run deploy` runs this check automatically before CDK provisioning; offline synthesis continues to support the example fixtures. The current production draft intentionally fails preflight until a real runtime secret with a working MongoDB connection is supplied. The locally configured MongoDB hostname returned `ENOTFOUND` during the read-only check and is not a verified production database.

CDK bootstrap must already exist in the intended account/region. Review IAM and network changes in the diff before the operator applies the stack. The application release role is deliberately unable to bootstrap or deploy CloudFormation.

Configure a recipient with `alertEmail`, deploy the subscription and confirm it through SNS. Without a confirmed subscription, the topic receives alarm events but no email is delivered. After telemetry begins, inspect the dashboard and alarm state before relying on alert coverage. New database/readiness alarms intentionally breach when probe metrics are missing.

Existing ALBs must route health checks to `/api/health/ready` (HTTP 200 only), permit long scraping responses with an idle timeout above 135 seconds, and drain targets for at least 30 seconds. Restrict task port 3000 to the ALB security group. Set `TRUST_PROXY=true` only after confirming that topology; the managed stack establishes it. Use `TRUST_PROXY_HOPS=2` for the selected CloudFront/private-ALB path and 1 for a direct ALB. Releases preserve these settings unless explicitly overridden.

## Connect GitHub Actions

Create a protected GitHub environment named `production`, restrict deployment branches to `main`, and configure the intended reviewers/branch protection. Add these environment variables from CDK outputs or the actual deployment:

| GitHub variable | Source |
| --- | --- |
| `AWS_REGION` | Intended region |
| `AWS_DEPLOY_ROLE_ARN` | `DeployRoleArn` output |
| `ECR_REPOSITORY` | `RepositoryUri` output (complete URI, no tag) |
| `ECS_CLUSTER`, `ECS_SERVICE`, `TASK_FAMILY` | Corresponding outputs |
| `LOG_GROUP`, `RESUME_BUCKET` | `LogGroupName`, `ResumeBucketName` outputs |
| `FRONTEND_URL` | Public HTTPS origin |
| `GATEWAY_CONTAINER` | Existing container name; defaults to `gateway` |
| `TRUST_PROXY` | Optional override; managed tasks preserve their verified proxy setting |
| `TRUST_PROXY_HOPS` | Optional override; `TrustProxyHops` output is 2 for CloudFront + ALB, 1 for direct ALB |

No long-lived AWS access keys belong in GitHub secrets. Workflows pin external actions to commit IDs. Dependabot proposes dependency/action updates.

`CI` runs on pull requests and `main`; it validates gateway/agent/infra/tools, synthesizes CDK, builds the production container and checks its runtime dependencies. `Deploy gateway` is manually dispatched from `main`, reruns release checks, acquires environment approval if configured, builds an image, verifies that exact image with the local runtime/recovery drill and publishes a unique immutable tag. It resolves the ECR digest, registers a task revision, updates the service and verifies that exact revision completed. Releases do not cancel another in-progress release. The managed service also supports [ECS circuit-breaker and alarm rollback](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-failure-detection.html).

## Release verification and rollback

Check `/`, a client route, `/api/health/live` and `/api/health/ready` over the public origin. Verify logs contain `http_request` JSON and embedded metrics appear in the `GradHunt` namespace with the intended `Service` and `Environment`. Smoke-test upload → analysis → saved history with a test account. This final smoke test exercises S3, MongoDB, AI and email beyond the cheap CI workload.

The release script waits up to 15 minutes, preserves configured deployment alarms, and treats an ECS automatic rollback as failure. It restores the previous task definition on a detected failure and verifies the restored revision. If the job is interrupted externally, use the previous revision printed before the update:

```sh
aws ecs update-service --cluster "$ECS_CLUSTER" --service "$ECS_SERVICE" --task-definition "$PREVIOUS_TASK_DEFINITION_ARN"
aws ecs wait services-stable --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE"
aws ecs describe-services --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE" --query 'services[0].{TaskDefinition:taskDefinition,Deployments:deployments,Events:events[:5]}'
```

Compare the returned revision with the requested rollback revision, then repeat readiness and user-flow checks. Container rollback does not undo data/schema changes. For a CDK-managed service, later infrastructure updates may restore the image encoded in the CDK asset; review that task-definition diff and reconcile it with the intended release before applying infrastructure changes.
