# Reliability objectives and evidence

The repository now contains an implementation for each requested priority. Cloud resources, GitHub environment settings and email subscriptions still require the real deployment target and operator configuration; local checks do not establish production availability.

| Priority | Implementation | Evidence |
| --- | --- | --- |
| P0 monitoring | CloudWatch embedded request/dependency/readiness metrics, structured request logs/IDs, dashboard, service/resource/target alarms and SNS actions; ECS deployment-failed events | Gateway HTTP tests; CDK assertions; inspect real namespace/subscription after deployment |
| P0 CI/CD | PR/main checks, production container smoke tests, protected-environment OIDC release workflow, immutable digest, exact-revision verification, rollback | Workflow definitions; release success/rollback unit tests; local image smoke test |
| P1 IaC | AWS CDK existing-service integration and managed gateway stack | Both modes synthesized/asserted without using AWS credentials |
| P1 recovery | Dependency circuits, bounded scrape concurrency/caches, provider/process deadlines, isolated scraper files, honest all-source failure status, graceful shutdown, S3 upload storage | Circuit, bulkhead, HTTP and cross-task storage tests; local database outage drill |
| P1 runbooks | Deployment, rollback, incident triage, upload failures and staging drills | `docs/runbooks/` |
| P2 IAM | Scoped task/execution/release roles, exact OIDC trust, documented wildcard exceptions, private uploads | `docs/iam-review.md`; CDK policy assertions |
| P2 load/SLO | k6 workload, measured local summary, report validation, request/error-budget CloudWatch reporting | `tests/load/reliability.js`, `scripts/slo_report.py`, `scripts/cloudwatch_slo.py` |

## Objectives

Proposed starting objectives are 99.9% success for observed gateway API requests over 30 days (5xx and aborted responses count as failures), p95 below 1 second for the cheap authentication/readiness workload, and 99% successful searches with p95 below 120 seconds for the optional search workload. Expected auth denials count as successful enforcement in the cheap workload. These initial objectives require calibration against real usage and business expectations.

Health probes are excluded from production request-success metrics. Client 4xx responses are not server failures. Requests rejected before reaching the gateway require ALB metrics; a no-traffic interval is not proof of uptime. The SLO scripts fail or report inconclusive when samples are missing. They do not average percentiles or infer month-long reliability from a short test.

The 5% API-error alarm over three minutes is an incident trigger with a minimum traffic gate, not the 30-day SLO. Overall latency alarms use the 120-second scraping budget; the cheap-workload latency objective is evaluated separately by k6. Database/target/ALB signals cover low-traffic outages. Missing database metrics intentionally alarm. `alertEmail` must be configured and confirmed before email delivery works.

## Run a load test

Use a staging/local deployment with connected MongoDB. The default workload exercises unauthorized auth enforcement and database readiness; it does not spend AI credits or scrape external sites. Install k6 or use the checked-in `Local container load and SLO report` workflow.

```sh
mkdir -p reports
BASE_URL=http://localhost:3000 VUS=5 DURATION=30s k6 run --summary-export=reports/k6-summary.json tests/load/reliability.js
python3 scripts/slo_report.py reports/k6-summary.json
```

For controlled scraper testing, set `RUN_SEARCH=true`, begin with one virtual user and allow the 130-second request budget. The built-in role/location repeats will mostly hit the cache after a cold search; report cold and warm behavior separately. Do not infer third-party scraping capacity or AI latency from the default workload. Increase traffic gradually and record CPU, memory, instance count, cache state and dependency outcomes with each report.

For a real production request-based SLO and remaining error budget:

```sh
python3 scripts/cloudwatch_slo.py --region us-west-2 --environment production --days 30
```

The caller needs read-only `cloudwatch:GetMetricData`. The report distinguishes observations from time-based uptime and includes aborted requests. Track external-origin availability and ALB-only failures separately. Keep generated reports in `reports/` (ignored by Git); CI can retain them as artifacts. A shareable checked-in validation record belongs in [validation record](validation.md) after actual measurements.

## Local checks

```sh
npm test --prefix backend
npm run lint --prefix frontend
npm run build --prefix frontend
npm test --prefix infra
npm run synth --prefix infra -- --quiet -c config=config.example.json
python -m pytest agent-service/tests -q
python3 -m unittest discover -s scripts -p 'test_*.py'
```

The gateway's socket-based tests require loopback access. Agent tests use deterministic logic and mocked health dependencies rather than real OpenAI/PostgreSQL. Storage tests mock S3 to verify cross-task behavior; a live S3 smoke test remains part of deployment verification. The existing two React effect-dependency lint warnings remain visible.
