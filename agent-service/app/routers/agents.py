"""Agent invocation + run-inspection API.

The Node gateway calls these endpoints. ``verify_internal_token`` enforces a
shared secret so the agent service isn't directly reachable by clients.
"""

from __future__ import annotations

from secrets import compare_digest

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..agents.resume_optimization import run_resume_optimization
from ..config import settings
from ..db import get_db
from ..models import AgentRun
from ..schemas import ResumeOptimizationRequest, ResumeOptimizationResponse

router = APIRouter(prefix="/api/agents", tags=["agents"])


def verify_internal_token(x_internal_token: str | None = Header(default=None)) -> None:
    if not settings.internal_api_token:
        return  # auth disabled (local dev)
    if not compare_digest(x_internal_token or "", settings.internal_api_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Internal-Token.",
        )


@router.post(
    "/resume-optimization",
    response_model=ResumeOptimizationResponse,
    dependencies=[Depends(verify_internal_token)],
)
def resume_optimization(
    req: ResumeOptimizationRequest,
    db: Session = Depends(get_db),
) -> ResumeOptimizationResponse:
    try:
        return run_resume_optimization(db, req)
    except RuntimeError as exc:
        # e.g. missing OPENAI_API_KEY - surface as a clear 503.
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))


@router.get("/runs/{run_id}", dependencies=[Depends(verify_internal_token)])
def get_run(run_id: int, db: Session = Depends(get_db)) -> dict:
    run = db.get(AgentRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")
    return {
        "id": run.id,
        "user_id": run.user_id,
        "agent_name": run.agent_name,
        "status": run.status.value,
        "scores": run.scores,
        "prompt_tokens": run.prompt_tokens,
        "completion_tokens": run.completion_tokens,
        "latency_ms": run.latency_ms,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "error": run.error,
    }


@router.get("/runs", dependencies=[Depends(verify_internal_token)])
def list_runs(
    user_id: str | None = None,
    agent_name: str | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
) -> dict:
    stmt = select(AgentRun).order_by(AgentRun.created_at.desc()).limit(min(limit, 200))
    if user_id:
        stmt = stmt.where(AgentRun.user_id == user_id)
    if agent_name:
        stmt = stmt.where(AgentRun.agent_name == agent_name)
    runs = db.execute(stmt).scalars().all()
    return {
        "items": [
            {
                "id": r.id,
                "user_id": r.user_id,
                "agent_name": r.agent_name,
                "status": r.status.value,
                "scores": r.scores,
                "latency_ms": r.latency_ms,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in runs
        ],
        "total": len(runs),
    }
