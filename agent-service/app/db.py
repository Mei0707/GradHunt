"""SQLAlchemy engine/session wiring for Postgres + pgvector.

Same shape as the IDP backend (`engine`, `SessionLocal`, `get_db`, `init_db`),
but targets Postgres and ensures the `vector` extension exists so the agent
memory and RAG tables can store embeddings natively.
"""

import logging

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings

logger = logging.getLogger(__name__)

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    future=True,
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency that yields a session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create the pgvector extension and all tables.

    Safe to call repeatedly; CREATE EXTENSION / CREATE TABLE are IF NOT EXISTS.
    """
    from . import models  # noqa: F401  (register ORM models on Base)

    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(bind=engine)
    logger.info("Database initialized (pgvector extension + tables ready).")


def healthcheck(db: Session) -> bool:
    try:
        db.execute(text("SELECT 1"))
        return True
    except Exception:  # noqa: BLE001 - health endpoint must never raise
        return False
