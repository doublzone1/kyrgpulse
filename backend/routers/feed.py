"""RSS/Atom feed for latest apartments."""

from datetime import datetime
from email.utils import format_datetime
from typing import Optional
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.db import get_db
from models.apartment import Apartment
from services.rate_limiter import limiter

router = APIRouter(prefix="/feed", tags=["feed"])


def _rss_date(dt: Optional[datetime]) -> str:
    if dt is None:
        return format_datetime(datetime.now())
    if dt.tzinfo is None:
        from datetime import timezone
        dt = dt.replace(tzinfo=timezone.utc)
    return format_datetime(dt)


@router.get("", response_class=Response)
@limiter.limit("30/minute")
async def rss_feed(
    request: Request,
    rooms: Optional[int] = Query(None),
    min_price: Optional[int] = Query(None),
    max_price: Optional[int] = Query(None),
    source: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """RSS 2.0 feed of latest apartments."""
    q = (
        select(Apartment)
        .where(Apartment.is_duplicate == False)  # noqa: E712
        .order_by(Apartment.parsed_at.desc())
    )
    if rooms is not None:
        q = q.where(Apartment.rooms == rooms)
    if min_price is not None:
        q = q.where(Apartment.price >= min_price)
    if max_price is not None:
        q = q.where(Apartment.price <= max_price)
    if source:
        q = q.where(Apartment.source == source)
    q = q.limit(limit)

    result = await db.execute(q)
    apartments = result.scalars().all()

    items_xml = []
    for apt in apartments:
        if not apt.link or apt.price is None:
            continue
        rooms_str = f"{apt.rooms}-комн. " if apt.rooms else ""
        area_str = f"· {apt.total_area} м² " if apt.total_area else ""
        price_str = f"{apt.price:,}".replace(",", " ")
        title = f"{rooms_str}{area_str}— {price_str} KGS"
        desc_parts = [escape(apt.title or "")]
        if apt.address:
            desc_parts.append(f"Адрес: {escape(apt.address)}")
        if apt.params:
            desc_parts.append(escape(apt.params[:200]))
        description = " | ".join(desc_parts)
        pub_date = _rss_date(apt.parsed_at)
        apt_link = escape(apt.link)
        items_xml.append(f"""    <item>
      <title>{escape(title)}</title>
      <link>{apt_link}</link>
      <description>{description}</description>
      <pubDate>{pub_date}</pubDate>
      <guid isPermaLink="true">{apt_link}</guid>
      <source url="{apt_link}">{escape(apt.source or "")}</source>
    </item>""")

    channel_date = _rss_date(apartments[0].parsed_at if apartments else None)
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>KyrgPulse — аренда квартир в Бишкеке</title>
    <link>https://kyrgpulse.app</link>
    <description>Актуальные объявления об аренде квартир в Бишкеке</description>
    <language>ru</language>
    <lastBuildDate>{channel_date}</lastBuildDate>
    <atom:link href="https://kyrgpulse.app/api/feed" rel="self" type="application/rss+xml"/>
{chr(10).join(items_xml)}
  </channel>
</rss>"""

    return Response(content=xml, media_type="application/rss+xml; charset=utf-8")
