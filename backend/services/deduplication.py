"""Deduplication service.

Marks re-posted listings as duplicates using pure SQL.
A listing is a duplicate if:
  - same rooms count (exact)
  - total_area within 5%
  - price within 8%
  - parsed within 7 days of an older identical-looking listing
  - different link (different DB row)

Among each duplicate group the oldest listing is kept as canonical.
"""

from loguru import logger
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_DEDUP_SQL = text("""
WITH candidate_pairs AS (
    SELECT
        newer.id   AS newer_id,
        older.id   AS older_id
    FROM apartments newer
    JOIN apartments older ON (
        newer.id != older.id
        AND newer.rooms IS NOT NULL
        AND newer.rooms = older.rooms
        AND newer.total_area IS NOT NULL
        AND older.total_area IS NOT NULL
        AND ABS(newer.total_area - older.total_area) / NULLIF(older.total_area, 0) < 0.05
        AND ABS(newer.price    - older.price)        / NULLIF(older.price, 0)       < 0.08
        AND newer.parsed_at > older.parsed_at
        AND newer.parsed_at - older.parsed_at < INTERVAL '7 days'
    )
    WHERE newer.parsed_at >= NOW() - INTERVAL '7 days'
      AND newer.is_duplicate = FALSE
),
ranked AS (
    SELECT newer_id, older_id,
           ROW_NUMBER() OVER (PARTITION BY newer_id ORDER BY older_id ASC) AS rn
    FROM candidate_pairs
)
UPDATE apartments
SET is_duplicate    = TRUE,
    duplicate_of_id = r.older_id
FROM (SELECT newer_id, older_id FROM ranked WHERE rn = 1) r
WHERE apartments.id = r.newer_id
RETURNING apartments.id
""")


async def mark_duplicates(session: AsyncSession) -> int:
    """Find and mark duplicate listings. Returns count of newly marked duplicates."""
    result = await session.execute(_DEDUP_SQL)
    await session.commit()
    count = result.rowcount or 0
    if count > 0:
        logger.info(f"Deduplication: marked {count} duplicate listings")
    return count
