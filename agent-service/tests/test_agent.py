"""Unit tests that don't require OpenAI or Postgres.

They cover the deterministic pieces: strict-schema generation, RAG cosine
ranking, evaluation scoring, and that the LangGraph actually compiles into a
runnable pipeline with the expected nodes.
"""

import os

# Point at a sqlite URL so importing app.db at collection time never tries to
# reach Postgres. The real service uses Postgres+pgvector; these tests only
# exercise pure logic and the in-memory graph build.
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from app.schemas import ATSAnalysis, Optimization, ParsedResume, SelfEvaluation  # noqa: E402
from app.services import evaluation, rag  # noqa: E402
from app.services.llm import _enforce_strict  # noqa: E402


def test_enforce_strict_marks_objects_closed_and_required():
    schema = ParsedResume.model_json_schema()
    _enforce_strict(schema)
    assert schema["additionalProperties"] is False
    assert set(schema["required"]) == set(schema["properties"].keys())


def test_enforce_strict_recurses_into_defs():
    schema = Optimization.model_json_schema()
    _enforce_strict(schema)
    # OptimizedBullet lives in $defs and must also be locked down.
    bullet = schema["$defs"]["OptimizedBullet"]
    assert bullet["additionalProperties"] is False
    assert set(bullet["required"]) == {"section", "original", "improved", "reason"}


def test_rag_cosine_identical_vectors():
    assert rag._cosine([1.0, 0.0], [1.0, 0.0]) == 1.0
    assert rag._cosine([1.0, 0.0], [0.0, 1.0]) == 0.0
    assert rag._cosine([], [1.0]) == 0.0


def test_evaluation_scoring():
    ats = ATSAnalysis(
        ats_score=60,
        matched_keywords=["python", "sql", "react"],
        missing_keywords=["kubernetes"],
        missing_requirements=["3 years experience", "AWS"],
        formatting_issues=[],
        rationale="ok",
    )
    ev = SelfEvaluation(
        projected_ats_score=78, projected_improvement=18, confidence=0.8, summary="better"
    )
    scores = evaluation.score_run(ats=ats, evaluation=ev)
    assert scores["ats_score_improvement"] == 18
    # keyword_coverage = 3 / (3 + 1)
    assert scores["keyword_coverage"] == 0.75
    # requirement_coverage = 1 - 2/10
    assert scores["requirement_coverage"] == 0.8


def test_graph_compiles_with_all_nodes():
    from app.agents.resume_optimization.graph import COMPILED
    from app.agents.resume_optimization.nodes import NODES

    node_names = {name for name, _ in NODES}
    graph_nodes = set(COMPILED.get_graph().nodes.keys())
    # Every defined node is present in the compiled graph.
    assert node_names.issubset(graph_nodes)
    assert "load_memory" in graph_nodes and "persist_memory" in graph_nodes
