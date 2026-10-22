#!/usr/bin/env python3
"""Report observed gateway request reliability; missing samples are inconclusive."""
import argparse
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import subprocess


def evaluate(results):
    values = {item['Id']: sum(item.get('Values', [])) for item in results}
    requests = values.get('requests', 0)
    if requests <= 0:
        raise ValueError('No request samples; production SLO is inconclusive.')
    failures = values.get('errors', 0) + values.get('aborts', 0)
    # Require all result streams; absent error metrics must not silently become zero.
    if any(not any(item['Id'] == name and item.get('Values') for item in results)
           for name in ['requests', 'errors', 'aborts']):
        raise ValueError('Incomplete metric streams; production SLO is inconclusive.')
    return {'requests': requests, 'failures': failures,
            'success_percent': 100 * (1 - failures / requests),
            'remaining_error_budget': requests * 0.001 - failures}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--region', required=True)
    parser.add_argument('--environment', default='production')
    parser.add_argument('--days', type=int, default=30, choices=range(1, 31), metavar='1..30')
    parser.add_argument('--output', type=Path, default=Path('reports/production-slo.md'))
    args = parser.parse_args()
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=args.days)
    queries = []
    for identifier, name in [('requests', 'Requests'), ('errors', 'ServerErrors'), ('aborts', 'AbortedRequests')]:
        queries.append({'Id': identifier, 'MetricStat': {'Metric': {
            'Namespace': 'GradHunt', 'MetricName': name, 'Dimensions': [
                {'Name': 'Service', 'Value': 'gateway'}, {'Name': 'Environment', 'Value': args.environment}]},
            'Period': 3600, 'Stat': 'Sum'}, 'ReturnData': True})
    result = subprocess.run(['aws', 'cloudwatch', 'get-metric-data', '--region', args.region,
        '--start-time', start.isoformat(), '--end-time', end.isoformat(), '--metric-data-queries', json.dumps(queries),
        '--output', 'json'], check=True, capture_output=True, text=True)
    data = json.loads(result.stdout)
    if data.get('NextToken') or any(r.get('StatusCode') != 'Complete' for r in data['MetricDataResults']):
        raise ValueError('CloudWatch returned incomplete results; rerun for a shorter window.')
    observed = evaluate(data['MetricDataResults'])
    passed = observed['success_percent'] >= 99.9
    body = '\n'.join([
        '# GradHunt observed-request SLO', '', f'Window: {start.isoformat()} to {end.isoformat()}',
        f'Environment: {args.environment} ({args.region})', '', f'Result: **{"PASS" if passed else "FAIL"}**',
        f"Requests: {int(observed['requests'])}", f"5xx + aborted requests: {int(observed['failures'])}",
        f"Observed success: {observed['success_percent']:.4f}% (objective: 99.9%)",
        f"Remaining error budget: {observed['remaining_error_budget']:.2f} requests", '',
        'Health checks are excluded. This measures requests reaching gateway tasks.',
        'ALB-only failures and time without traffic require separate target-health and ALB alarms.',
        'This is a request-based measure, not time-based uptime. No percentile is derived by averaging percentiles.', '',
    ])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(body)
    print(body)
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
