"""Long-term agent memory backed by pgvector.

Implements the proposal's Agent Memory System: write structured facts into one
of four categories (user_profile / application / preference / learning) and
retrieve the most relevant memories for a given query via cosine similarity.

All agents share this module so memory is genuinely cross-agent.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import AgentMemory, MemoryCategory
from . import embeddings, llm


@dataclass
class RetrievedMemory:
    category: str
    content: str
    similarity: float
    meta: dict | None


def write_memory(
    db: Session,
    *,
    user_id: str,
    category: MemoryCategory,
    content: str,
    meta: dict | None = None,
) -> tuple[AgentMemory, llm.Usage]:
    """Embed and persist a single memory fact. Returns the row and token usage."""
    vector, usage = embeddings.embed_one(content)
    record = AgentMemory(
        user_id=user_id,
        category=category,
        content=content,
        meta=meta,
        embedding=vector,
    )
    db.add(record)
    db.flush()  # assign id without committing; caller owns the transaction
    return record, usage


def retrieve(
    db: Session,
    *,
    user_id: str,
    query: str,
    k: int,
    categories: list[MemoryCategory] | None = None,
) -> tuple[list[RetrievedMemory], llm.Usage]:
    """Return the top-k memories for ``user_id`` most similar to ``query``.

    Uses pgvector's cosine distance operator (<=>); similarity = 1 - distance.
    """
    query_vec, usage = embeddings.embed_one(query)
    if not query_vec:
        return [], usage

    distance = AgentMemory.embedding.cosine_distance(query_vec)
    stmt = (
        select(AgentMemory, distance.label("distance"))
        .where(AgentMemory.user_id == user_id)
        .order_by(distance)
        .limit(k)
    )
    if categories:
        stmt = stmt.where(AgentMemory.category.in_(categories))

    rows = db.execute(stmt).all()
    results = [
        RetrievedMemory(
            category=row[0].category.value,
            content=row[0].content,
            similarity=round(1.0 - float(row[1]), 4),
            meta=row[0].meta,
        )
        for row in rows
    ]
    return results, usage


def format_for_prompt(memories: list[RetrievedMemory]) -> str:
    """Render retrieved memories as a compact context block for an LLM prompt."""
    return format_for_prompt_echo(memories)


def format_for_prompt_echo(memories) -> str:
    """Render any memory objects exposing ``category``/``content``/``similarity``.

    Accepts both ``RetrievedMemory`` and the API ``MemoryEcho`` so nodes can
    format whatever they have on the graph state.
    """
    if not memories:
        return "(no prior memory for this user)"
    lines = [
        f"- [{m.category}] {m.content}"
        for m in memories
        if getattr(m, "similarity", 1.0) > 0.15
    ]
    return "\n".join(lines) if lines else "(no sufficiently relevant memory)"
