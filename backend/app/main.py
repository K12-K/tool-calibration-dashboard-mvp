import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import init_db
from .routers import attachments, auth, gauges, meta, reports

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("calibration")


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.validate_for_production()
    settings.upload_path.mkdir(parents=True, exist_ok=True)
    init_db()
    log.info("Calibration Log API ready (environment=%s)", settings.environment)
    yield


app = FastAPI(
    title="Calibration Log API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.docs_enabled else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if settings.docs_enabled else None,
)

if settings.cors_origin_list:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(auth.router)
app.include_router(meta.router)
app.include_router(gauges.router)
app.include_router(attachments.router)
app.include_router(reports.router)


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok"}
