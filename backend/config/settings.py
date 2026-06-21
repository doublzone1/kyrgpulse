import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent


def _get_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _get_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _get_list(name: str, default: list[str]) -> list[str]:
    value = os.getenv(name)
    if not value:
        return default
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings:
    PROJECT_NAME: str = "KyrgPulse"
    VERSION: str = "1.0.0"

    # Parsing (lalafo.kg)
    CITY: str = os.getenv("CITY", "bishkek")
    MAX_PAGES: int = _get_int("MAX_PAGES", 10)
    HEADLESS: bool = _get_bool("HEADLESS", True)
    SLOW_MO: int = _get_int("SLOW_MO", 800)

    # Parsing — detail pages (для извлечения площади/этажа/описания)
    PARSE_DETAILS: bool = _get_bool("PARSE_DETAILS", True)
    DETAIL_CONCURRENCY: int = _get_int("DETAIL_CONCURRENCY", 3)
    DETAIL_DELAY_MS: int = _get_int("DETAIL_DELAY_MS", 1500)
    DETAIL_TIMEOUT_MS: int = _get_int("DETAIL_TIMEOUT_MS", 45000)

    # Database
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "kyrgpulse")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "kyrgpulse123")
    POSTGRES_HOST: str = os.getenv("POSTGRES_HOST", "postgres")
    POSTGRES_PORT: str = os.getenv("POSTGRES_PORT", "5432")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "kyrgpulse_db")
    # Render/Heroku give postgres:// or postgresql://, asyncpg needs postgresql+asyncpg://
    _raw_db_url: str = os.getenv("DATABASE_URL", "")
    if _raw_db_url:
        _raw_db_url = _raw_db_url.replace("postgres://", "postgresql+asyncpg://", 1)
        _raw_db_url = _raw_db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    DATABASE_URL: str = _raw_db_url or (
        f"postgresql+asyncpg://{POSTGRES_USER}:{POSTGRES_PASSWORD}"
        f"@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
    )

    # API
    CORS_ORIGINS: list[str] = _get_list(
        "CORS_ORIGINS",
        ["http://localhost:3000", "http://127.0.0.1:3000"],
    )

    # Currency (KGS + real-time rates)
    DEFAULT_CURRENCY: str = "KGS"
    SUPPORTED_CURRENCIES: list = ["KGS", "USD", "EUR", "RUB"]

    # Celery
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0")
    CELERY_RESULT_BACKEND: str = os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0")

    # Telegram Bot
    TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_BOT_USERNAME: str = os.getenv("TELEGRAM_BOT_USERNAME", "")
    TELEGRAM_ADMIN_CHAT_ID: str = os.getenv("TELEGRAM_ADMIN_CHAT_ID", "")
    TMA_URL: str = os.getenv("TMA_URL", "https://kyrgpulse.app/tma/search")

    # Monitoring
    SENTRY_DSN: str = os.getenv("SENTRY_DSN", "")

    # Admin
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "change_me_in_production")

    # Paths
    BASE_DIR: Path = BASE_DIR
    DATA_DIR: Path = BASE_DIR / "data"
    RAW_DATA: Path = BASE_DIR / "data" / "raw"
    PROCESSED_DATA: Path = BASE_DIR / "data" / "processed"

    def __init__(self):
        self.RAW_DATA.mkdir(parents=True, exist_ok=True)
        self.PROCESSED_DATA.mkdir(parents=True, exist_ok=True)
        (self.DATA_DIR / "models").mkdir(parents=True, exist_ok=True)

settings = Settings()
