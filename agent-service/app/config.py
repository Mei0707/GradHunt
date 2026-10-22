"""Centralized configuration via pydantic-settings.

Mirrors the convention used by the IDP backend: one Settings object read from
the environment / .env, imported wherever config is needed.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- Service ---
    service_name: str = "gradhunt-agent-service"
    environment: str = "development"
    cloudwatch_emf: bool = False
    # Shared secret the Node gateway sends in the X-Internal-Token header.
    # Empty string disables the check (local dev only).
    internal_api_token: str = ""

    # --- OpenAI ---
    openai_api_key: str = ""
    openai_chat_model: str = "gpt-4.1-mini"
    openai_embedding_model: str = "text-embedding-3-small"
    # text-embedding-3-small => 1536 dims. Keep in sync with the pgvector column.
    embedding_dim: int = 1536

    # --- Data layer ---
    # Production: Postgres with the pgvector extension.
    # Example: postgresql+psycopg://gradhunt:gradhunt@localhost:5433/gradhunt_agents
    database_url: str = (
        "postgresql+psycopg://gradhunt:gradhunt@localhost:5433/gradhunt_agents"
    )
    redis_url: str = "redis://localhost:6379/0"

    # --- Agent behavior ---
    memory_retrieval_k: int = 5
    rag_retrieval_k: int = 6
    rag_chunk_size: int = 1200
    rag_chunk_overlap: int = 150


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
