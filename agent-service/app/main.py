"""FastAPI entrypoint for the GradHunt agent service.

Brings up the multi-agent layer the proposal describes. This first release ships
the Resume Optimization Agent end-to-end; additional agents register their own
routers here as they are built.
"""

import logging
import json
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from .config import settings
from .db import SessionLocal, healthcheck, init_db
from .routers import agents

logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.environment == "production" and len(settings.internal_api_token) < 32:
        raise RuntimeError("Production INTERNAL_API_TOKEN must have at least 32 characters")
    init_db()
    yield


app = FastAPI(
    title="GradHunt Agent Service",
    description="Multi-agent career copilot layer (LangGraph + RAG + agent memory).",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

@app.middleware("http")
async def observe_request(request, call_next):
    started = time.perf_counter()
    request_id = str(uuid.uuid4())
    status = 500
    try:
        response = await call_next(request)
        status = response.status_code
        response.headers["X-Request-ID"] = request_id
        return response
    finally:
        elapsed = (time.perf_counter() - started) * 1000
        logging.getLogger("gradhunt.http").info(json.dumps({
            "event": "http_request", "requestId": request_id,
            "route": getattr(request.scope.get("route"), "path", "unmatched"),
            "status": status, "durationMs": elapsed,
        }))
        if settings.cloudwatch_emf and request.url.path.startswith("/api/agents"):
            logging.getLogger("gradhunt.metrics").info(json.dumps({
                "_aws": {"Timestamp": int(time.time() * 1000), "CloudWatchMetrics": [{
                    "Namespace": "GradHunt", "Dimensions": [["Service", "Environment"]],
                    "Metrics": [{"Name": "Requests", "Unit": "Count"},
                                {"Name": "ServerErrors", "Unit": "Count"},
                                {"Name": "Latency", "Unit": "Milliseconds"}],
                }]},
                "Service": "agent", "Environment": settings.environment,
                "Requests": 1, "ServerErrors": int(status >= 500), "Latency": elapsed,
            }))


app.include_router(agents.router)


@app.get("/api/health/live", tags=["ops"])
def live():
    return {"status": "ok"}


@app.get("/api/health", tags=["ops"])
def health():
    db = SessionLocal()
    try:
        db_ok = healthcheck(db)
    finally:
        db.close()
    return JSONResponse(status_code=200 if db_ok else 503, content={
        "status": "ok" if db_ok else "degraded",
        "service": settings.service_name,
        "environment": settings.environment,
        "database": "ok" if db_ok else "unreachable",
    })


@app.get("/metrics", tags=["ops"])
def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)
