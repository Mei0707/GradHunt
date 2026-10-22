"""Evaluation framework for the Resume Optimization Agent.

Computes the proposal's Resume Agent metrics from a completed run:

* ats_score_improvement       - projected gain from the optimizations.
* requirement_coverage        - share of job requirements already met.
* keyword_coverage            - matched / (matched + missing) keywords.
* recommendation_volume       - how many concrete revisions were produced.

These are written to ``AgentRun.scores`` and exposed by the runs API so the
self-improvement loop and dashboards can track agent quality over time.
"""

from __future__ import annotations

from ..schemas import ATSAnalysis, SelfEvaluation


def _ratio(numerator: int, denominator: int) -> float:
    return round(numerator / denominator, 4) if denominator else 0.0


def score_run(*, ats: ATSAnalysis, evaluation: SelfEvaluation) -> dict:
    matched = len(ats.matched_keywords)
    missing_kw = len(ats.missing_keywords)
    missing_req = len(ats.missing_requirements)

    keyword_coverage = _ratio(matched, matched + missing_kw)
    # Requirement coverage is unknown in absolute terms; proxy it by penalizing
    # the number of unmet requirements relative to a typical posting (~10).
    requirement_coverage = round(max(0.0, 1.0 - missing_req / 10.0), 4)

    return {
        "ats_score": ats.ats_score,
        "projected_ats_score": evaluation.projected_ats_score,
        "ats_score_improvement": evaluation.projected_improvement,
        "evaluation_confidence": evaluation.confidence,
        "keyword_coverage": keyword_coverage,
        "requirement_coverage": requirement_coverage,
        "matched_keywords": matched,
        "missing_keywords": missing_kw,
        "missing_requirements": missing_req,
    }
