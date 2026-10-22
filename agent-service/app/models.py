"""ORM models for agent runs and long-term agent memory.

Two tables back the production multi-agent architecture:

* ``AgentRun``    - an audit/eval record of every agent invocation, including
                    structured output, self-evaluation scores, token usage and
                    latency. This is what the evaluation framework and
                    observability dashboards read from.
* ``AgentMemory`` - the long-term, vector-searchable memory described in the
                    proposal (User Profile / Application / Preference / Learning
                    categories). Embeddings live in a native pgvector column.
"""

from __future__ import annotations

import enum
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    DateTime,
    Enum,
    Float,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .config import settings
from .db import Base


class MemoryCategory(str, enum.Enum):
    """Memory categories from the proposal's Agent Memory System."""

    user_profile = "user_profile"
    application = "application"
    preference = "preference"
    learning = "learning"


class RunStatus(str, enum.Enum):
    running = "running"
    completed = "completed"
    failed = "failed"


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # External user id from the Node side (Mongo ObjectId string). Nullable for
    # anonymous / system runs.
    user_id: Mapped[str | None] = mapped_column(String(64), index=True, default=None)
    agent_name: Mapped[str] = mapped_column(String(64), index=True)
    status: Mapped[RunStatus] = mapped_column(
        Enum(RunStatus, name="run_status"), default=RunStatus.running
    )

    input: Mapped[dict] = mapped_column(JSONB, default=dict)
    output: Mapped[dict | None] = mapped_column(JSONB, default=None)
    error: Mapped[str | None] = mapped_column(Text, default=None)

    # Evaluation signals (see services/evaluation.py).
    scores: Mapped[dict | None] = mapped_column(JSONB, default=None)

    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class AgentMemory(Base):
    __tablename__ = "agent_memory"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    category: Mapped[MemoryCategory] = mapped_column(
        Enum(MemoryCategory, name="memory_category"), index=True
    )
    content: Mapped[str] = mapped_column(Text)
    meta: Mapped[dict | None] = mapped_column(JSONB, default=None)
    embedding: Mapped[list[float]] = mapped_column(Vector(settings.embedding_dim))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


# ANN index for fast cosine retrieval over memories. ivfflat needs the table to
# have rows before it is fully effective, but creating it up front is harmless.
Index(
    "ix_agent_memory_embedding",
    AgentMemory.embedding,
    postgresql_using="ivfflat",
    postgresql_with={"lists": 100},
    postgresql_ops={"embedding": "vector_cosine_ops"},
)
