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
                    _light_migrations(conn)
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


def _light_migrations(conn) -> None:
    _migrate_frequency_to_days(conn)
    _migrate_attachment_columns(conn)


def _migrate_frequency_to_days(conn) -> None:
    """v1.2: FREQUENCY is stored in days instead of months. Existing rows are converted using the
    real number of days between calibration and due date (months x 30 when no due date exists).
    The old frequency_months column is left in place, unused."""
    cols = {
        r[0]
        for r in conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'gauges' AND table_schema = current_schema()"
            )
        )
    }
    if "frequency_days" in cols:
        return
    conn.execute(text("ALTER TABLE gauges ADD COLUMN frequency_days INTEGER"))
    if "frequency_months" in cols:
        conn.execute(
            text(
                "UPDATE gauges SET frequency_days = CASE "
                " WHEN calibration_date IS NOT NULL AND due_date IS NOT NULL AND due_date > calibration_date "
                "   THEN (due_date - calibration_date) "
                " WHEN frequency_months IS NOT NULL THEN frequency_months * 30 END"
            )
        )


def _migrate_attachment_columns(conn) -> None:
    """create_all never alters existing tables, so add columns introduced after v1.0 here.
    Idempotent: runs its statements only when the column is missing."""
    cols = {
        r[0]
        for r in conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'attachments' AND table_schema = current_schema()"
            )
        )
    }
    if "tag" not in cols:
        conn.execute(text("ALTER TABLE attachments ADD COLUMN tag VARCHAR(100)"))
        # keep the old meaning: the newest certificate of each gauge was the "current" one
        conn.execute(
            text(
                "UPDATE attachments a SET tag = 'LATEST CERT' FROM ("
                " SELECT DISTINCT ON (gauge_id) id FROM attachments WHERE kind = 'certificate'"
                " ORDER BY gauge_id, uploaded_at DESC, id DESC) l WHERE a.id = l.id"
            )
        )
    if "sort_order" not in cols:
        conn.execute(text("ALTER TABLE attachments ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0"))
        conn.execute(
            text(
                "UPDATE attachments a SET sort_order = r.rn FROM ("
                " SELECT id, row_number() OVER (PARTITION BY gauge_id ORDER BY uploaded_at DESC, id DESC) - 1 AS rn"
                " FROM attachments WHERE kind = 'certificate') r WHERE a.id = r.id"
            )
        )
