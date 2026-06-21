from loguru import logger
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from config.settings import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False, pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


_MIGRATIONS = [
    "ALTER TABLE apartments ADD COLUMN IF NOT EXISTS is_duplicate BOOLEAN DEFAULT FALSE",
    "ALTER TABLE apartments ADD COLUMN IF NOT EXISTS duplicate_of_id INTEGER REFERENCES apartments(id) ON DELETE SET NULL",
    "ALTER TABLE apartments ADD COLUMN IF NOT EXISTS is_price_anomaly BOOLEAN DEFAULT FALSE",
    "ALTER TABLE apartments ADD COLUMN IF NOT EXISTS lat FLOAT",
    "ALTER TABLE apartments ADD COLUMN IF NOT EXISTS lng FLOAT",
    "ALTER TABLE apartments ADD COLUMN IF NOT EXISTS image_url VARCHAR",
    "ALTER TABLE apartments ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ",
    "UPDATE apartments SET first_seen_at = parsed_at WHERE first_seen_at IS NULL",
    # Full-text search vector
    "ALTER TABLE apartments ADD COLUMN IF NOT EXISTS search_vector tsvector",
    "CREATE INDEX IF NOT EXISTS apartments_search_vector_idx ON apartments USING GIN(search_vector)",
    # Amenities + lifecycle extras
    "ALTER TABLE apartments ADD COLUMN IF NOT EXISTS price_drop_count INTEGER DEFAULT 0",
    "ALTER TABLE apartments ADD COLUMN IF NOT EXISTS house_type VARCHAR",
    "ALTER TABLE apartments ADD COLUMN IF NOT EXISTS has_internet BOOLEAN",
    "ALTER TABLE apartments ADD COLUMN IF NOT EXISTS has_parking BOOLEAN",
    "ALTER TABLE apartments ADD COLUMN IF NOT EXISTS is_new_building BOOLEAN",
    # API keys
    """CREATE TABLE IF NOT EXISTS api_keys (
        id SERIAL PRIMARY KEY,
        key VARCHAR(64) UNIQUE NOT NULL,
        label VARCHAR(100),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_used_at TIMESTAMPTZ,
        requests_count INTEGER DEFAULT 0
    )""",
    "CREATE INDEX IF NOT EXISTS api_keys_key_idx ON api_keys (key)",
]

_POST_MIGRATIONS = [
    # Populate tsvector for existing rows
    """
    UPDATE apartments
    SET search_vector = to_tsvector('russian',
        coalesce(title,'') || ' ' || coalesce(address,'') || ' ' || coalesce(params,''))
    WHERE search_vector IS NULL
    """,
]


async def init_db():
    """Create tables and apply idempotent column migrations."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for stmt in _MIGRATIONS:
            try:
                await conn.execute(text(stmt))
            except Exception as exc:
                logger.warning(f"Migration skipped: {exc}")
        for stmt in _POST_MIGRATIONS:
            try:
                await conn.execute(text(stmt))
            except Exception as exc:
                logger.warning(f"Post-migration skipped: {exc}")
    logger.success("База данных KyrgPulse инициализирована")
