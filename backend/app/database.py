import logging
import time

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

log = logging.getLogger(__name__)

engine = create_engine(settings.database_url, pool_pre_ping=True, pool_size=10, max_overflow=10)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db(retries: int = 20, delay: float = 2.0) -> None:
    """Create tables. Retries so the API can start before PostgreSQL is ready."""
    from . import models  # noqa: F401  (register models)

    for attempt in range(1, retries + 1):
        try:
            with engine.connect() as conn:
                # advisory lock: several uvicorn workers start at once, only one may create tables
                conn.execute(text("SELECT pg_advisory_lock(727001)"))
                try:
                    Base.metadata.create_all(conn)
                    conn.commit()
                finally:
                    conn.execute(text("SELECT pg_advisory_unlock(727001)"))
                    conn.commit()
            return
        except Exception as exc:  # noqa: BLE001
            log.warning("Database not ready (%s/%s): %s", attempt, retries, exc)
            if attempt == retries:
                raise
            time.sleep(delay)
