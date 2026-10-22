"""Chunking + embedding helpers (ported from the IDP backend's approach)."""

from __future__ import annotations

from ..config import settings
from . import llm


def chunk_text(text: str, chunk_size: int | None = None, overlap: int | None = None) -> list[str]:
    """Split text into overlapping chunks, preferring paragraph/sentence breaks."""
    chunk_size = chunk_size or settings.rag_chunk_size
    overlap = overlap or settings.rag_chunk_overlap

    text = (text or "").strip()
    if not text:
        return []
    if len(text) <= chunk_size:
        return [text]

    chunks: list[str] = []
    start = 0
    n = len(text)
    while start < n:
        end = min(start + chunk_size, n)
        if end < n:
            window = text.rfind("\n\n", start, end)
            if window == -1 or window < start + chunk_size // 2:
                window = text.rfind(". ", start, end)
            if window != -1 and window > start + chunk_size // 2:
                end = window + 1
        chunks.append(text[start:end].strip())
        if end >= n:
            break
        start = max(end - overlap, start + 1)
    return [c for c in chunks if c]


def embed_one(text: str) -> tuple[list[float], llm.Usage]:
    vectors, usage = llm.embed([text])
    return (vectors[0] if vectors else []), usage
