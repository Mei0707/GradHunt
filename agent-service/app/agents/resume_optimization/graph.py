"""Compiles the Resume Optimization Agent as a LangGraph StateGraph and exposes
a single ``run_resume_optimization`` entrypoint used by the API layer.

The graph is built once at import time (compilation is cheap and the structure
is static); each request invokes it with a fresh state carrying the DB session.
Run-level persistence, evaluation scoring, and metrics happen around the graph
invocation here so the nodes stay pure.
"""

from __future__ import annotations

import time

from langgraph.graph import END, START, StateGraph
from sqlalchemy.orm import Session

from ...models import AgentRun, RunStatus
from ...observability import logger, record_run
from ...schemas import ResumeOptimizationRequest, ResumeOptimizationResponse
from ...services import evaluation, llm
from .nodes import AGENT, NODES
from .state import ResumeAgentState


def _build_graph():
    graph = StateGraph(ResumeAgentState)
    for name, fn in NODES:
        graph.add_node(name, fn)

    # Linear pipeline: START -> n0 -> n1 -> ... -> END
    graph.add_edge(START, NODES[0][0])
    for (prev, _), (nxt, _) in zip(NODES, NODES[1:]):
        graph.add_edge(prev, nxt)
    graph.add_edge(NODES[-1][0], END)
    return graph.compile()


# Compiled once; reused across requests.
COMPILED = _build_graph()


def run_resume_optimization(
    db: Session, req: ResumeOptimizationRequest
) -> ResumeOptimizationResponse:
    """Execute the agent end-to-end and persist an AgentRun audit/eval record."""
    run = AgentRun(
        user_id=req.user_id,
        agent_name=AGENT,
        status=RunStatus.running,
        input={
            "job_title": req.job_title,
            "company": req.company,
            "resume_chars": len(req.resume_text),
            "jd_chars": len(req.job_description),
        },
    )
    db.add(run)
    db.flush()  # assign run.id

    start = time.perf_counter()
    state: ResumeAgentState = {
        "user_id": req.user_id,
        "resume_text": req.resume_text,
        "job_description": req.job_description,
        "job_title": req.job_title,
        "company": req.company,
        "db": db,
        "usage": llm.Usage(),
    }

    try:
        final: ResumeAgentState = COMPILED.invoke(state)
        latency_ms = int((time.perf_counter() - start) * 1000)

        ats = final["ats"]
        opt = final["optimization"]
        ev = final["evaluation"]
        usage: llm.Usage = final.get("usage", llm.Usage())

        scores = evaluation.score_run(ats=ats, evaluation=ev)

        run.status = RunStatus.completed
        run.output = {
            "ats": ats.model_dump(),
            "optimization": opt.model_dump(),
            "evaluation": ev.model_dump(),
        }
        run.scores = scores
        run.prompt_tokens = usage.prompt_tokens
        run.completion_tokens = usage.completion_tokens
        run.latency_ms = latency_ms
        db.commit()

        record_run(
            AGENT, "completed", latency_ms / 1000.0,
            usage.prompt_tokens, usage.completion_tokens,
        )

        return ResumeOptimizationResponse(
            run_id=run.id,
            ats_score=ats.ats_score,
            projected_ats_score=ev.projected_ats_score,
            projected_improvement=ev.projected_improvement,
            confidence=ev.confidence,
            matched_keywords=ats.matched_keywords,
            missing_keywords=ats.missing_keywords,
            missing_requirements=ats.missing_requirements,
            formatting_issues=ats.formatting_issues,
            optimized_bullets=opt.optimized_bullets,
            section_recommendations=opt.section_recommendations,
            keyword_additions=opt.keyword_additions,
            evaluation_summary=ev.summary,
            memory_used=final.get("memories", []),
            prompt_tokens=usage.prompt_tokens,
            completion_tokens=usage.completion_tokens,
            latency_ms=latency_ms,
        )
    except Exception as exc:  # noqa: BLE001 - record failure then re-raise
        latency_ms = int((time.perf_counter() - start) * 1000)
        run.status = RunStatus.failed
        run.error = str(exc)
        run.latency_ms = latency_ms
        db.commit()
        record_run(AGENT, "failed", latency_ms / 1000.0, 0, 0)
        logger.exception("resume_optimization run failed (run_id=%s)", run.id)
        raise
