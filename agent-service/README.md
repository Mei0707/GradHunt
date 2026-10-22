# GradHunt Agent Service

The **multi-agent career copilot layer** from the GradHunt AI proposal, built as
a standalone Python microservice that the existing Node/Express API calls into.
This keeps the working Node gateway (auth, scraping, resume storage, the React
app) and adds the production AI stack — **FastAPI + LangGraph + RAG + pgvector
agent memory** — where it matters.

This first release ships the **Resume Optimization Agent** end-to-end. The same
patterns (LangGraph state machine, shared memory, RAG, evaluation, observability)
are the template for the remaining agents (Job Discovery, Cover Letter,
Application Tracking, Interview Coach).

## Architecture

```
React ──▶ Node/Express (auth, scrapers, resume upload, Mongo)
                 │  POST /api/resume/optimize   (X-Internal-Token)
                 ▼
        Python agent service  (this repo)
        FastAPI ─▶ LangGraph: load_memory ▶ parse_resume ▶ retrieve_context(RAG)
                                ▶ ats_analysis ▶ optimize ▶ evaluate ▶ persist_memory
                 │
                 ├─ Postgres + pgvector  (agent_runs, agent_memory)
                 └─ Prometheus /metrics, /api/health
```

The LangGraph pipeline implements the proposal's RAG flow:
**Query Generation → Embedding Search → Context Retrieval → LLM Reasoning →
Structured Output Generation**, and writes back into long-term memory so the
agent improves across sessions (the proposal's self-improvement loop).

### Layout

| Path | Purpose |
|------|---------|
| `app/main.py` | FastAPI app, lifespan (`init_db`), `/api/health`, `/metrics` |
| `app/config.py` | pydantic-settings configuration |
| `app/db.py` | SQLAlchemy engine/session; creates the `vector` extension |
| `app/models.py` | `AgentRun` (audit/eval) + `AgentMemory` (pgvector) |
| `app/schemas.py` | API + strict structured-output Pydantic models |
| `app/services/llm.py` | OpenAI wrapper: strict structured outputs + token accounting |
| `app/services/embeddings.py` | chunking + embedding |
| `app/services/memory.py` | long-term agent memory (write / cosine retrieve) |
| `app/services/rag.py` | RAG over the job description |
| `app/services/evaluation.py` | Resume Agent eval metrics |
| `app/agents/resume_optimization/` | the LangGraph agent (state, prompts, nodes, graph) |
| `app/routers/agents.py` | `/api/agents/*` endpoints |

## Run it locally

```bash
cd agent-service
cp .env.example .env            # add your OPENAI_API_KEY

# 1) data layer (Postgres+pgvector on :5433, Redis on :6379)
docker compose up -d postgres redis

# 2) the service (host)
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8100
```

Or run everything in containers:

```bash
OPENAI_API_KEY=sk-... docker compose up --build
```

Health check: `curl localhost:8100/api/health` · Metrics: `localhost:8100/metrics`
· API docs: `localhost:8100/docs`

## Call the agent

```bash
curl -X POST localhost:8100/api/agents/resume-optimization \
  -H 'Content-Type: application/json' \
  -d '{
    "user_id": "demo-user",
    "resume_text": "Experienced CS student ... built a React app ...",
    "job_description": "We are hiring a backend engineer. Requirements: Python, AWS, SQL ...",
    "job_title": "Backend Engineer",
    "company": "Acme"
  }'
```

Response includes `ats_score`, `projected_ats_score`, `missing_requirements`,
`optimized_bullets`, `section_recommendations`, the memory used, and token/latency.

Inspect runs (evaluation history): `GET /api/agents/runs?user_id=demo-user`.

## From the Node side

`POST /api/resume/optimize` (auth + verified email required) resolves the resume
text and authenticated user id, then delegates here via
`backend/services/agentServiceClient.js`. Configure the Node `.env`:

```
AGENT_SERVICE_URL=http://localhost:8100
AGENT_SERVICE_TOKEN=            # must match INTERNAL_API_TOKEN if set
```

## Tests

```bash
pip install -r requirements.txt
pytest            # pure-logic tests; no OpenAI/Postgres needed
```

## Next agents

Add `app/agents/<name>/` with the same `state.py / prompts.py / nodes.py /
graph.py` shape, register a router in `app/routers/agents.py`, and reuse
`services/memory.py`, `services/rag.py`, and `services/evaluation.py`.
