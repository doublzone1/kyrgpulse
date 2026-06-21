from contextlib import asynccontextmanager
from datetime import datetime, timezone

import sentry_sdk
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from prometheus_fastapi_instrumentator import Instrumentator
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy.exc import SQLAlchemyError

import tasks  # registers Celery tasks
import models.subscription  # noqa: F401 — registers TelegramSubscription table
import models.price_history  # noqa: F401 — registers PriceHistory table
import models.api_key  # noqa: F401 — registers ApiKey table
from config.database import init_db
from config.settings import settings
from routers.analytics import router as analytics_router
from routers.apartments import router as apartments_router
from routers.telegram import router as telegram_router
from routers.feed import router as feed_router
from routers.api_keys import router as api_keys_router
from services.rate_limiter import limiter

_parser_status: dict = {"last_run_at": None, "status": "unknown", "result": None}

if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        traces_sample_rate=0.05,
        environment="production",
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await init_db()
        logger.success(f"{settings.PROJECT_NAME} API запущен v{settings.VERSION}")
    except Exception:
        logger.exception("Не удалось запустить API")
        raise
    yield


app = FastAPI(
    title="KyrgPulse API",
    description="Аналитика аренды квартир в Кыргызстане (lalafo.kg + house.kg)",
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(apartments_router)
app.include_router(analytics_router)
app.include_router(telegram_router)
app.include_router(feed_router)
app.include_router(api_keys_router)

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


@app.exception_handler(SQLAlchemyError)
async def database_exception_handler(request: Request, exc: SQLAlchemyError):
    logger.exception(f"Database error on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=503,
        content={
            "detail": "База данных временно недоступна. Проверьте PostgreSQL и повторите запрос.",
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled error on {request.method} {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Внутренняя ошибка сервера. Подробности записаны в лог backend."},
    )


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": settings.PROJECT_NAME, "version": settings.VERSION}


@app.get("/health/parser")
async def parser_health():
    """Returns status of the last parse run (updated by Celery task signal)."""
    if _parser_status["last_run_at"] is None:
        raw_dir = settings.RAW_DATA
        files = sorted(raw_dir.glob("lalafo_raw_*.parquet"), key=lambda f: f.stat().st_mtime, reverse=True)
        if files:
            last_file = files[0]
            mtime = datetime.fromtimestamp(last_file.stat().st_mtime, tz=timezone.utc)
            age_hours = (datetime.now(timezone.utc) - mtime).total_seconds() / 3600
            return {
                "status": "ok" if age_hours < 8 else "stale",
                "last_run_at": mtime.isoformat(),
                "age_hours": round(age_hours, 1),
                "last_file": last_file.name,
                "files_count": len(files),
            }
        return {"status": "never_run", "last_run_at": None, "age_hours": None}

    age_hours = (datetime.now() - _parser_status["last_run_at"]).total_seconds() / 3600
    return {
        "status": "ok" if age_hours < 8 else "stale",
        "last_run_at": _parser_status["last_run_at"].isoformat(),
        "age_hours": round(age_hours, 1),
        **(_parser_status["result"] or {}),
    }


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
