"""Pydantic models: API request/response + the agent's structured LLM outputs.

The ``*Out`` models double as the strict JSON-schema contract for the LLM (via
services.llm.structured), so every field is required and self-describing.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


# --------------------------------------------------------------------------- #
# Structured LLM outputs (also used as strict response_format schemas)
# --------------------------------------------------------------------------- #
class ParsedResume(BaseModel):
    candidate_summary: str = Field(description="One- or two-sentence summary of the candidate.")
    experience_level: str = Field(description="e.g. 'student', 'intern', 'new grad', 'junior'.")
    target_roles: list[str]
    skills: list[str]
    tools_and_frameworks: list[str]
    bullets: list[str] = Field(description="Verbatim experience/achievement bullet points from the resume.")
    sections: list[str] = Field(description="Section headings present in the resume.")


class ATSAnalysis(BaseModel):
    ats_score: int = Field(ge=0, le=100, description="ATS compatibility score for this specific job.")
    matched_keywords: list[str]
    missing_keywords: list[str]
    missing_requirements: list[str] = Field(description="Job requirements not evidenced in the resume.")
    formatting_issues: list[str] = Field(description="ATS-unfriendly formatting problems, if any.")
    rationale: str


class OptimizedBullet(BaseModel):
    section: str
    original: str
    improved: str
    reason: str


class SectionRecommendation(BaseModel):
    section: str
    recommendation: str


class Optimization(BaseModel):
    optimized_bullets: list[OptimizedBullet]
    section_recommendations: list[SectionRecommendation]
    keyword_additions: list[str] = Field(description="Keywords to weave in naturally to pass ATS.")


class SelfEvaluation(BaseModel):
    projected_ats_score: int = Field(ge=0, le=100)
    projected_improvement: int = Field(description="projected_ats_score minus the original ats_score.")
    confidence: float = Field(ge=0.0, le=1.0)
    summary: str


# --------------------------------------------------------------------------- #
# API request / response
# --------------------------------------------------------------------------- #
class ResumeOptimizationRequest(BaseModel):
    user_id: str = Field(description="External user id from the Node side.")
    resume_text: str = Field(min_length=80)
    job_description: str = Field(min_length=40)
    job_title: str | None = None
    company: str | None = None


class MemoryEcho(BaseModel):
    category: str
    content: str
    similarity: float


class ResumeOptimizationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    run_id: int
    ats_score: int
    projected_ats_score: int
    projected_improvement: int
    confidence: float

    matched_keywords: list[str]
    missing_keywords: list[str]
    missing_requirements: list[str]
    formatting_issues: list[str]

    optimized_bullets: list[OptimizedBullet]
    section_recommendations: list[SectionRecommendation]
    keyword_additions: list[str]

    evaluation_summary: str
    memory_used: list[MemoryEcho]

    prompt_tokens: int
    completion_tokens: int
    latency_ms: int
