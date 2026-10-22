"""Retrieval-Augmented Generation over a job description.

Implements the proposal's RAG pipeline for the per-request knowledge source
(the target job description):

    Query Generation -> Embedding Search -> Context Retrieval

The job description is chunked and embedded on the fly, then the most relevant
chunks for a set of queries are returned to ground the agent's reasoning. This
keeps grounding tight to the *specific* posting instead of relying on the LLM's
memory of it.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from ..config import settings
from . import embeddings, llm


@dataclass
class Passage:
    text: str
    score: float


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def retrieve_job_context(
    job_description: str,
    queries: list[str],
    *,
    k: int | None = None,
) -> tuple[list[Passage], llm.Usage]:
    """Return the top-k job-description passages most relevant to ``queries``.

    A single embedding call covers every chunk and query for efficiency.
    """
    k = k or settings.rag_retrieval_k
    chunks = embeddings.chunk_text(job_description)
    if not chunks:
        return [], llm.Usage()

    usage = llm.Usage()
    chunk_vecs, u = llm.embed(chunks)
    usage.add(u)
    query_vecs, u = llm.embed(queries) if queries else ([], llm.Usage())
    usage.add(u)

    # Best similarity of each chunk against any query.
    best: list[Passage] = []
    for text, cvec in zip(chunks, chunk_vecs):
        score = max((_cosine(cvec, qvec) for qvec in query_vecs), default=0.0)
        best.append(Passage(text=text, score=round(score, 4)))

    best.sort(key=lambda p: p.score, reverse=True)
    return best[:k], usage


def format_for_prompt(passages: list[Passage]) -> str:
    if not passages:
        return "(no job description provided)"
    return "\n\n".join(f"[relevance {p.score}] {p.text}" for p in passages)
