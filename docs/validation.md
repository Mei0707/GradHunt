# Validation record — 2026-10-22

This record describes local checks of the reliability changes. It does not claim a live AWS rollout or a measured production SLO.

| Check | Result |
| --- | --- |
| Gateway tests | 16 passed: readiness/liveness, JSON errors, production SPA, draining, mounted-route EMF, circuits, overload protection, trusted IP handling, source failures/cancellation and shared upload storage |
| Python agent tests | 8 passed: existing deterministic graph/schema/scoring tests plus health/token checks |
| CDK assertions | 4 passed: existing-service integration, exact OIDC trust and PassRole scope, managed private/HTTPS/redundant service, invalid configuration |
| Release and SLO tools | 12 passed: exact-revision success, rollback, unstable-service rejection, immutable-image guard, empty/missing samples, measured failures and both k6 summary shapes |
| CDK synthesis | Existing and managed examples synthesize with AWS context lookups disabled; explicit availability zones make offline synthesis reproducible |
| Frontend | Production build succeeds; lint has zero errors and two existing effect-dependency warnings |
| GitHub workflows | All four workflow files pass actionlint 1.7.7 |
| Dependencies | Compatible lockfile updates and removal of unused Puppeteer leave zero reported npm audit vulnerabilities in backend, frontend and infrastructure at verification time |
| Production image | Builds successfully; contains bundled SPA, non-root browser runtime, Python scraper dependencies, Linux Word extraction and a liveness check; local uploads/secrets are excluded |
| Runtime failure drill | MongoDB stopped: readiness 503, liveness 200. MongoDB restarted: readiness recovers automatically. SIGTERM exits cleanly with code 0. |
| Runtime telemetry/parser | Mounted API emits CloudWatch EMF; real DOCX fixture extracts successfully on Linux |

## Measured local load

Workload: Docker Desktop on the development machine, one production gateway container and MongoDB 7, k6 1.3.0, five virtual users, 30 seconds. Each iteration requests unauthenticated `/api/auth/me` (expected 401), requests database readiness (expected 200), then waits one second.

| Measurement | Observed |
| --- | ---: |
| Auth requests | 150 |
| Readiness requests | 150 |
| Checks passed | 300 / 300 |
| Unexpected auth responses | 0 |
| Auth p95 latency | 14.06 ms |
| Auth average latency | 4.63 ms |
| Auth maximum latency | 41.03 ms |
| Total HTTP request rate | 9.89 requests/s |

All configured thresholds passed. The generated `reports/k6-summary.json` and `reports/slo.md` are local artifacts. The workload checks gateway overhead and database readiness; it does not measure search throughput, AI/provider latency, S3 access, production networking or month-long uptime. Cached versus cold scraper behavior needs its own controlled workload.

## Activation still required

The intended existing AWS deployment was not found in the configured account during read-only discovery. No CloudFormation/ECS changes, repository push, GitHub environment configuration, SNS subscription or external email was performed. To activate the implementation, identify the real target, fill its configuration, review the infrastructure diff, connect the protected release environment and confirm alarm recipients using the deployment runbook.

Live S3 upload/analysis, optional agent/PostgreSQL integration, actual AWS IAM authorization, real alert delivery, ECS rollback and production SLO collection remain deployment-environment verification steps. Existing agent code and its gateway integration were already present as local untracked work when this task began; retain those files with the reliability changes when preparing a commit.
