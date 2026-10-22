"""LangGraph node functions for the Resume Optimization Agent.

Each node performs one step of the proposal's RAG pipeline
(Query Generation -> Embedding Search -> Context Retrieval -> LLM Reasoning ->
Structured Output Generation) and returns a partial state update. Per-node
latency is exported to Prometheus.

Pipeline:
    load_memory -> parse_resume -> retrieve_context -> ats_analysis
                -> optimize -> evaluate -> persist_memory
"""

from __future__ import annotations

import time
from typing import Callable

from ...observability import NODE_LATENCY, logger
from ...models import MemoryCategory
from ...schemas import (
    ATSAnalysis,
    MemoryEcho,
    Optimization,
    ParsedResume,
    SelfEvaluation,
)
from ...services import llm, memory, rag
from ...config import settings
from .prompts import ATS_SYSTEM, EVAL_SYSTEM, OPTIMIZE_SYSTEM, PARSE_SYSTEM
from .state import ResumeAgentState

AGENT = "resume_optimization"


def _timed(node_name: str, fn: Callable[[ResumeAgentState], dict]) -> Callable[[ResumeAgentState], dict]:
    """Wrap a node with Prometheus timing + debug logging."""

    def wrapper(state: ResumeAgentState) -> dict:
        start = time.perf_counter()
        try:
            return fn(state)
        finally:
            elapsed = time.perf_counter() - start
            NODE_LATENCY.labels(agent=AGENT, node=node_name).observe(elapsed)
            logger.info("node=%s elapsed_ms=%d", node_name, int(elapsed * 1000))

    return wrapper


def _add_usage(state: ResumeAgentState, usage: llm.Usage) -> None:
    state.setdefault("usage", llm.Usage()).add(usage)


# --------------------------------------------------------------------------- #
# Nodes
# --------------------------------------------------------------------------- #
def _load_memory(state: ResumeAgentState) -> dict:
    """Retrieve relevant long-term memory (profile + preferences) for grounding."""
    query = f"{state.get('job_title') or ''} {state['resume_text'][:500]}"
    mems, usage = memory.retrieve(
        state["db"],
        user_id=state["user_id"],
        query=query,
        k=settings.memory_retrieval_k,
        categories=[MemoryCategory.user_profile, MemoryCategory.preference, MemoryCategory.learning],
    )
    _add_usage(state, usage)
    return {
        "memories": [
            MemoryEcho(category=m.category, content=m.content, similarity=m.similarity)
            for m in mems
        ]
    }


def _parse_resume(state: ResumeAgentState) -> dict:
    parsed, usage = llm.structured(
        PARSE_SYSTEM,
        f"Parse this resume:\n\n{state['resume_text']}",
        ParsedResume,
        temperature=0.0,
    )
    _add_usage(state, usage)
    return {"parsed": parsed}


def _retrieve_context(state: ResumeAgentState) -> dict:
    """RAG: derive queries from the parsed resume, retrieve grounded job passages."""
    parsed: ParsedResume = state["parsed"]
    queries = [
        state.get("job_title") or "",
        "required qualifications and must-have skills",
        "responsibilities and day-to-day work",
        " ".join(parsed.target_roles[:3]),
        " ".join(parsed.skills[:8]),
    ]
    queries = [q for q in queries if q.strip()]
    passages, usage = rag.retrieve_job_context(state["job_description"], queries)
    _add_usage(state, usage)
    return {"passages": passages}


def _ats_analysis(state: ResumeAgentState) -> dict:
    parsed: ParsedResume = state["parsed"]
    user = (
        f"CANDIDATE MEMORY:\n{memory.format_for_prompt_echo(state.get('memories', []))}\n\n"
        f"PARSED RESUME:\n{parsed.model_dump_json(indent=2)}\n\n"
        f"TARGET JOB: {state.get('job_title') or 'N/A'} at {state.get('company') or 'N/A'}\n\n"
        f"RELEVANT JOB PASSAGES:\n{rag.format_for_prompt(state.get('passages', []))}"
    )
    ats, usage = llm.structured(ATS_SYSTEM, user, ATSAnalysis, temperature=0.1)
    _add_usage(state, usage)
    return {"ats": ats}


def _optimize(state: ResumeAgentState) -> dict:
    parsed: ParsedResume = state["parsed"]
    ats: ATSAnalysis = state["ats"]
    user = (
        f"PARSED RESUME:\n{parsed.model_dump_json(indent=2)}\n\n"
        f"ATS GAP ANALYSIS:\n{ats.model_dump_json(indent=2)}\n\n"
        f"RELEVANT JOB PASSAGES:\n{rag.format_for_prompt(state.get('passages', []))}"
    )
    opt, usage = llm.structured(OPTIMIZE_SYSTEM, user, Optimization, temperature=0.3)
    _add_usage(state, usage)
    return {"optimization": opt}


def _evaluate(state: ResumeAgentState) -> dict:
    ats: ATSAnalysis = state["ats"]
    opt: Optimization = state["optimization"]
    user = (
        f"ORIGINAL ATS ANALYSIS:\n{ats.model_dump_json(indent=2)}\n\n"
        f"PROPOSED OPTIMIZATIONS:\n{opt.model_dump_json(indent=2)}\n\n"
        f"Original ats_score was {ats.ats_score}."
    )
    evaluation, usage = llm.structured(EVAL_SYSTEM, user, SelfEvaluation, temperature=0.0)
    _add_usage(state, usage)
    return {"evaluation": evaluation}


def _persist_memory(state: ResumeAgentState) -> dict:
    """Write durable facts back into long-term memory (self-improvement loop).

    Stores a profile snapshot and a learning note about recurring gaps so future
    runs for this user start better-grounded.
    """
    db = state["db"]
    parsed: ParsedResume = state["parsed"]
    ats: ATSAnalysis = state["ats"]

    profile_fact = (
        f"Resume profile: {parsed.experience_level}; "
        f"skills: {', '.join(parsed.skills[:15])}; "
        f"targets: {', '.join(parsed.target_roles[:5])}."
    )
    _, u = memory.write_memory(
        db,
        user_id=state["user_id"],
        category=MemoryCategory.user_profile,
        content=profile_fact,
        meta={"source": AGENT},
    )
    _add_usage(state, u)

    if ats.missing_requirements:
        learning = (
            f"For '{state.get('job_title') or 'a target role'}', the resume lacked: "
            f"{', '.join(ats.missing_requirements[:6])}."
        )
        _, u = memory.write_memory(
            db,
            user_id=state["user_id"],
            category=MemoryCategory.learning,
            content=learning,
            meta={"source": AGENT, "ats_score": ats.ats_score},
        )
        _add_usage(state, u)

    return {}


# Exposed (name, callable) pairs the graph wires together, in order.
NODES: list[tuple[str, Callable[[ResumeAgentState], dict]]] = [
    ("load_memory", _timed("load_memory", _load_memory)),
    ("parse_resume", _timed("parse_resume", _parse_resume)),
    ("retrieve_context", _timed("retrieve_context", _retrieve_context)),
    ("ats_analysis", _timed("ats_analysis", _ats_analysis)),
    ("optimize", _timed("optimize", _optimize)),
    ("evaluate", _timed("evaluate", _evaluate)),
    ("persist_memory", _timed("persist_memory", _persist_memory)),
]
