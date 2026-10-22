"""Prometheus metrics + structured logging for the agent service.

Production observability per the proposal (latency, token usage, cost, success
rate, agent execution time). Metrics are exposed at ``/metrics`` for Prometheus
to scrape; Grafana dashboards / OTel collectors can be layered on top without
touching agent code.
"""

from __future__ import annotations

import logging

from prometheus_client import Counter, Histogram

logger = logging.getLogger("gradhunt.agent")

# --- Counters / histograms keyed by agent name and outcome ---
AGENT_RUNS = Counter(
    "gradhunt_agent_runs_total",
    "Total agent runs by agent and status.",
    ["agent", "status"],
)
AGENT_LATENCY = Histogram(
    "gradhunt_agent_latency_seconds",
    "End-to-end agent latency in seconds.",
    ["agent"],
    buckets=(0.5, 1, 2, 3, 5, 8, 13, 21, 34, 60),
)
AGENT_TOKENS = Counter(
    "gradhunt_agent_tokens_total",
    "LLM tokens consumed by agent and token type.",
    ["agent", "kind"],
)
NODE_LATENCY = Histogram(
    "gradhunt_agent_node_latency_seconds",
    "Per-graph-node latency in seconds.",
    ["agent", "node"],
    buckets=(0.1, 0.25, 0.5, 1, 2, 3, 5, 8, 13),
)


def record_run(agent: str, status: str, latency_s: float, prompt_tokens: int, completion_tokens: int) -> None:
    AGENT_RUNS.labels(agent=agent, status=status).inc()
    AGENT_LATENCY.labels(agent=agent).observe(latency_s)
    AGENT_TOKENS.labels(agent=agent, kind="prompt").inc(prompt_tokens)
    AGENT_TOKENS.labels(agent=agent, kind="completion").inc(completion_tokens)
