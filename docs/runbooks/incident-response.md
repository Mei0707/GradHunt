# Incident response and recovery

Use `GradHunt-<environment>` in CloudWatch and the deployment workflow's last known good task revision. Record incident start, user impact, region/service, first failing request ID, recent release, actions, verification and follow-up owner. Keep user resumes, passwords and tokens out of incident notes.

## First checks

Check liveness and readiness separately:

```sh
curl --fail --show-error "$FRONTEND_URL/api/health/live"
curl --fail --show-error "$FRONTEND_URL/api/health/ready"
aws ecs describe-services --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE" --query 'services[0].{Desired:desiredCount,Running:runningCount,Pending:pendingCount,Deployments:deployments,Events:events[:10]}'
aws logs tail "$LOG_GROUP" --since 15m --format short
```

Use the request ID to connect an error response with its log entry. If the origin is unavailable, inspect ALB target health and ECS task stop reasons. If the failure began with a release, restore the prior task definition using the deployment runbook.

| Signal | Meaning and checks | Recovery and verification |
| --- | --- | --- |
| API 5xx ≥ 5% for three minutes, minimum 20 requests/minute | Check failing route/status and release timing. Compare database, dependency, CPU and memory signals. | Restore a bad release or resolve its dependency. Verify the exact active revision, readiness and affected user flow. |
| API p95 ≥ 120 s for three minutes | Overall latency includes scraper/agent work. Look for stuck external calls and resource saturation. | Allow deadlines/circuits to contain failing work; reduce load or increase capacity within tested limits. Run the cheap load profile to separate gateway overhead from provider latency. |
| Database readiness below 1 or absent for two minutes | Gateway cannot ping MongoDB, or probes/log delivery stopped. Check ECS/logs first; then MongoDB status, TLS/DNS, network allowlist and secret revision. | Restore connectivity/credentials. Driver reconnect should make readiness return 200. Do not restart all tasks as the first response to a shared database outage. |
| Unhealthy ALB targets / load-balancer 5xx | Readiness failure, task start failure or routing/security-group mismatch. | Inspect stopped-task reasons, execution-role image/secret/log grants, health path and port. Restore capacity and verify public readiness. |
| CPU/memory ≥ 85% for five minutes | Browser fan-out, expensive password work or excess request load. Check running task count and memory stop reasons. | Scale within tested limits, limit ingress and let bulkheads shed excess searches. Verify pressure falls and errors recover. |
| Scraper failures ≥ 3 in five minutes | Inspect provider blocking, missing browser/Python dependencies and extraction changes. Other providers can continue. | Wait through the 30-second circuit cooldown and verify a successful probe. Repair the provider adapter; avoid repeatedly restarting tasks or increasing scraping rate against a blocked provider. |
| Agent failures ≥ 3 in five minutes | Check optional service health, matching internal tokens and PostgreSQL/OpenAI status. | Restore the agent independently. Gateway auth/search can remain available. Verify optimization through a verified test account. |
| Aborted requests ≥ 5/minute for three minutes | Clients disconnected before responses completed. Compare latency with frontend/proxy timeouts. | Reduce latency/load or align timeouts. Verify abort counts and request-based SLO recover. |
| ECS deployment-failed event / failed GitHub job | A circuit breaker, health check, permissions problem or exact-revision check stopped a release. | Inspect the failed step and ECS events. Verify automatic/scripted rollback and repair before retrying. A green ECS stable waiter alone does not prove the requested release succeeded. |

## Upload and storage failures

For upload/analysis failures, confirm `RESUME_BUCKET` matches the intended bucket and the gateway task role has only the required `s3:PutObject`/`s3:GetObject` access under `resumes/`. Confirm old uploads were migrated; new managed buckets retain raw files for 30 days. Check that the execution role and task role were not confused. Saved resume analysis in MongoDB survives raw-file expiration.

Production must never fall back to per-task disk. Diagnose access failures through CloudTrail and CloudWatch without making a bucket public or widening access to every bucket. Restore an overwritten object version only if required; normal generated keys are random UUIDs. Test upload on one task and analysis after another task takes traffic.

## Failure drills

Run drills in an isolated staging environment. Stop the local test MongoDB and verify readiness becomes 503 while liveness remains 200; restart it and verify recovery. Run a deliberately invalid staging image and verify the service restores the prior revision. Simulate dependency errors in automated circuit-breaker tests and verify the cooldown/half-open probe behavior. Keep production failure injection outside routine releases.

Declare recovery after readiness and the affected user flow succeed, deployment revision/capacity are correct, and relevant metrics stabilize across multiple evaluation periods. Write a short timeline and action items. Review whether alert thresholds, the runbook or deployment checks would have shortened the incident.
