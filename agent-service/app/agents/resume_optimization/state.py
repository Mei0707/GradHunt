"""Shared state for the Resume Optimization LangGraph.

LangGraph threads a single mutable state dict through every node. Each node
returns a partial update which LangGraph merges. We keep the running token
``Usage`` and the SQLAlchemy ``Session`` on the state so nodes can read memory,
embed, and accumulate cost without global state.
"""

from __future__ import annotations

from typing import TypedDict

from sqlalchemy.orm import Session

from ...schemas import (
    ATSAnalysis,
    MemoryEcho,
    Optimization,
    ParsedResume,
    SelfEvaluation,
)
from ...services import llm
from ...services.rag import Passage


class ResumeAgentState(TypedDict, total=False):
    # --- Inputs ---
    user_id: str
    resume_text: str
    job_description: str
    job_title: str | None
    company: str | None

    # --- Carried infra (not serialized out) ---
    db: Session
    usage: llm.Usage

    # --- Intermediate / output artifacts ---
    memories: list[MemoryEcho]
    parsed: ParsedResume
    passages: list[Passage]
    ats: ATSAnalysis
    optimization: Optimization
    evaluation: SelfEvaluation
