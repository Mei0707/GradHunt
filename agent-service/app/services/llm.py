"""Thin OpenAI wrapper with structured-output support and token accounting.

Centralizes client construction (key read once, shared timeout) like the IDP
backend's ``llm.py``. Adds:

* ``structured()`` - strict JSON-schema structured output parsed into a Pydantic
  model. This is the "Structured Output Generation" step of the proposal's RAG
  pipeline, and replaces the hand-rolled json_schema calls in the Node service.
* ``embed()``      - batch embeddings.

Both return token usage so the evaluation/observability layers can record cost.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from typing import TypeVar

from openai import OpenAI
from pydantic import BaseModel

from ..config import settings

T = TypeVar("T", bound=BaseModel)


@dataclass
class Usage:
    prompt_tokens: int = 0
    completion_tokens: int = 0

    def add(self, other: "Usage") -> None:
        self.prompt_tokens += other.prompt_tokens
        self.completion_tokens += other.completion_tokens


@dataclass
class StructuredResult:
    data: BaseModel
    usage: Usage = field(default_factory=Usage)


@lru_cache(maxsize=1)
def _client() -> OpenAI:
    if not settings.openai_api_key:
        raise RuntimeError(
            "OPENAI_API_KEY is not set. Copy .env.example to .env and add your key."
        )
    return OpenAI(api_key=settings.openai_api_key, timeout=90.0)


def _usage_from(resp) -> Usage:
    u = getattr(resp, "usage", None)
    if not u:
        return Usage()
    return Usage(
        prompt_tokens=getattr(u, "prompt_tokens", 0) or 0,
        completion_tokens=getattr(u, "completion_tokens", 0) or 0,
    )


def structured(system: str, user: str, schema: type[T], *, temperature: float = 0.2) -> tuple[T, Usage]:
    """Call the chat model and parse a strict JSON-schema response into ``schema``.

    Uses response_format=json_schema with strict=True so the model is forced to
    return a payload matching the Pydantic model exactly.
    """
    json_schema = schema.model_json_schema()
    # OpenAI strict mode requires additionalProperties:false on every object.
    _enforce_strict(json_schema)

    resp = _client().chat.completions.create(
        model=settings.openai_chat_model,
        temperature=temperature,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": schema.__name__,
                "schema": json_schema,
                "strict": True,
            },
        },
    )
    content = resp.choices[0].message.content or "{}"
    parsed = schema.model_validate_json(content)
    return parsed, _usage_from(resp)


def embed(texts: list[str]) -> tuple[list[list[float]], Usage]:
    if not texts:
        return [], Usage()
    resp = _client().embeddings.create(
        model=settings.openai_embedding_model,
        input=texts,
    )
    vectors = [item.embedding for item in resp.data]
    return vectors, _usage_from(resp)


def _enforce_strict(node: dict) -> None:
    """Recursively set additionalProperties:false and mark all keys required.

    OpenAI strict structured outputs require every object to disallow extra
    properties and to list all properties as required.
    """
    if not isinstance(node, dict):
        return
    if node.get("type") == "object" and "properties" in node:
        node["additionalProperties"] = False
        node["required"] = list(node["properties"].keys())
        for prop in node["properties"].values():
            _enforce_strict(prop)
    for key in ("items", "$defs", "definitions"):
        sub = node.get(key)
        if isinstance(sub, dict):
            if key in ("$defs", "definitions"):
                for v in sub.values():
                    _enforce_strict(v)
            else:
                _enforce_strict(sub)
    for combinator in ("anyOf", "allOf", "oneOf"):
        for sub in node.get(combinator, []):
            _enforce_strict(sub)
