#!/usr/bin/env python3
"""Turn a k6 JSON summary into an honest, machine-checked SLO report."""
import argparse
import json
from pathlib import Path


def report(summary):
    metrics = summary.get('metrics', {})
    # k6 --summary-export is flat; custom handleSummary exports may nest values.
    def values(name):
        metric = metrics.get(name, {})
        return metric.get('values', metric)
    count = values('api_requests').get('count', 0)
    failed = values('api_failures').get('rate', values('api_failures').get('value'))
    p95 = values('api_latency').get('p(95)')
    if not count or failed is None or p95 is None:
        raise ValueError('No complete API samples; SLO result is inconclusive.')
    availability = 100 * (1 - failed)
    passed = availability >= 99.9 and p95 < 1000
    lines = ['# GradHunt load-test SLO report', '',
             f'Result: **{"PASS" if passed else "FAIL"}**', '',
             '| Signal | Observed | Objective |', '| --- | ---: | ---: |',
             f'| API samples | {int(count)} | > 0 |',
             f'| Successful expected responses | {availability:.3f}% | ≥ 99.9% |',
             f'| API p95 latency | {p95:.1f} ms | < 1000 ms |']
    if 'search_failures' in metrics:
        search_rate = values('search_failures').get('rate', values('search_failures').get('value'))
        search_p95 = values('search_latency')['p(95)']
        passed = passed and search_rate <= 0.01 and search_p95 < 120000
        lines[2] = f'Result: **{"PASS" if passed else "FAIL"}**'
        lines += [f'| Search success | {(1-search_rate)*100:.3f}% | ≥ 99% |',
                  f'| Search p95 latency | {search_p95:.1f} ms | < 120000 ms |']
    checks = values('checks').get('fails', 0)
    if checks:
        passed = False
        lines[2] = 'Result: **FAIL**'
    lines += ['', 'This is evidence for this test window and workload only. It does not establish a 30-day production SLO.',
              'The default workload checks authentication and readiness. Scraper load requires RUN_SEARCH=true.', '']
    return '\n'.join(lines), passed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('summary', type=Path)
    parser.add_argument('--output', type=Path, default=Path('reports/slo.md'))
    args = parser.parse_args()
    try:
        body, passed = report(json.loads(args.summary.read_text()))
    except (ValueError, KeyError, OSError) as exc:
        body, passed = f'# GradHunt SLO report\n\nINCONCLUSIVE: {exc}\n', False
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(body)
    print(body)
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
