from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.db import get_db
from ml.analytics import AnalyticsService
from models.apartment import Apartment
from schemas.apartment import ApartmentResponse
from services.zones import ZONES, zone_filter_clause

router = APIRouter(prefix="/analytics", tags=["analytics"])
_analytics = AnalyticsService()

_AVG_SALARY_KGS = 30_000  # estimated Bishkek monthly avg salary


@router.get("/price-distribution")
async def price_distribution(db: AsyncSession = Depends(get_db)):
    return await _analytics.get_price_distribution(db)


@router.get("/zones")
async def zones_stats(db: AsyncSession = Depends(get_db)):
    zone_counts = []
    for zone in ZONES:
        clause = zone_filter_clause(zone["id"])
        q = select(func.count(Apartment.id))
        if clause is not None:
            q = q.where(clause)
        result = await db.execute(q)
        count = result.scalar_one()
        zone_counts.append({**zone, "count": count})
    return {"zones": zone_counts}


@router.get("/zones-comparison")
async def zones_comparison(db: AsyncSession = Depends(get_db)):
    rows = []
    for zone in ZONES:
        clause = zone_filter_clause(zone["id"])
        if clause is None:
            continue
        q = select(
            func.count(Apartment.id).label("count"),
            func.avg(Apartment.price).label("avg_price"),
            func.min(Apartment.price).label("min_price"),
            func.max(Apartment.price).label("max_price"),
            func.avg(Apartment.price_per_m2).label("avg_price_per_m2"),
        ).where(clause).where(Apartment.is_duplicate == False)  # noqa: E712
        result = await db.execute(q)
        r = result.one()
        rows.append({
            "zone_id": zone["id"],
            "label": zone["label"],
            "count": r.count,
            "avg_price": round(float(r.avg_price), 0) if r.avg_price else None,
            "min_price": int(r.min_price) if r.min_price else None,
            "max_price": int(r.max_price) if r.max_price else None,
            "avg_price_per_m2": round(float(r.avg_price_per_m2), 0) if r.avg_price_per_m2 else None,
        })
    rows.sort(key=lambda x: x["avg_price"] or 0)
    return {"zones": rows}


@router.get("/zone-price-trend")
async def zone_price_trend(
    days: int = Query(30, ge=7, le=365),
    db: AsyncSession = Depends(get_db),
):
    cutoff = datetime.now() - timedelta(days=days)
    result = {}
    for zone in ZONES:
        clause = zone_filter_clause(zone["id"])
        if clause is None:
            continue
        q = (
            select(
                func.date_trunc("week", Apartment.parsed_at).label("week"),
                func.avg(Apartment.price).label("avg_price"),
                func.count(Apartment.id).label("count"),
            )
            .where(clause)
            .where(Apartment.is_duplicate == False)  # noqa: E712
            .where(Apartment.parsed_at >= cutoff)
            .group_by(func.date_trunc("week", Apartment.parsed_at))
            .order_by(func.date_trunc("week", Apartment.parsed_at))
        )
        rows = (await db.execute(q)).all()
        result[zone["id"]] = {
            "label": zone["label"],
            "data": [
                {
                    "week": r.week.strftime("%Y-%m-%d"),
                    "avg_price": round(float(r.avg_price)),
                    "count": r.count,
                }
                for r in rows
                if r.week is not None and r.avg_price is not None
            ],
        }
    return result


@router.get("/affordability")
async def affordability_index(response: Response, db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "public, max-age=3600, stale-while-revalidate=86400"
    rows = []
    for zone in ZONES:
        clause = zone_filter_clause(zone["id"])
        if clause is None:
            continue
        q = select(
            func.avg(Apartment.price).label("avg_price"),
            func.count(Apartment.id).label("count"),
        ).where(clause).where(Apartment.is_duplicate == False)  # noqa: E712
        r = (await db.execute(q)).one()
        if r.avg_price is None:
            continue
        avg_price = round(float(r.avg_price))
        rows.append({
            "zone_id": zone["id"],
            "label": zone["label"],
            "avg_price": avg_price,
            "avg_salary": _AVG_SALARY_KGS,
            "rent_to_income": round(avg_price / _AVG_SALARY_KGS, 2),
            "count": r.count,
        })
    rows.sort(key=lambda x: x["rent_to_income"])
    return {"affordability": rows, "avg_salary": _AVG_SALARY_KGS}


@router.get("/seasonality")
async def price_seasonality(response: Response, db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "public, max-age=3600, stale-while-revalidate=86400"
    _MONTHS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн",
               "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"]
    q = (
        select(
            func.extract("month", Apartment.parsed_at).label("month"),
            func.avg(Apartment.price).label("avg_price"),
            func.count(Apartment.id).label("count"),
        )
        .where(Apartment.is_duplicate == False)  # noqa: E712
        .group_by(func.extract("month", Apartment.parsed_at))
        .order_by(func.extract("month", Apartment.parsed_at))
    )
    rows = (await db.execute(q)).all()
    return [
        {
            "month": int(r.month),
            "month_label": _MONTHS[int(r.month) - 1],
            "avg_price": round(float(r.avg_price)),
            "count": r.count,
        }
        for r in rows
    ]


@router.get("/top-deals")
async def top_deals(
    limit: int = Query(10, ge=1, le=50),
    rooms: int = Query(None),
    db: AsyncSession = Depends(get_db),
):
    q = (
        select(Apartment)
        .where(Apartment.is_duplicate == False)  # noqa: E712
        .where(Apartment.is_price_anomaly == False)  # noqa: E712
        .where(Apartment.price_per_m2.isnot(None))
        .where(Apartment.price > 10_000)
    )
    if rooms is not None:
        q = q.where(Apartment.rooms == rooms)
    q = q.order_by(Apartment.price_per_m2.asc()).limit(limit)
    result = await db.execute(q)
    items = result.scalars().all()
    return {"items": [ApartmentResponse.model_validate(a) for a in items]}


@router.get("/floor-stats")
async def floor_stats(response: Response, db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "public, max-age=3600, stale-while-revalidate=86400"
    sql = text("""
        SELECT
            CASE
                WHEN floor ~ '^[0-9]+/[0-9]+$'
                    THEN SPLIT_PART(floor, '/', 1)::integer
                WHEN floor ~ '^[0-9]+$'
                    THEN floor::integer
                ELSE NULL
            END AS floor_num,
            ROUND(AVG(price)) AS avg_price,
            ROUND(AVG(price_per_m2)) AS avg_price_per_m2,
            COUNT(*) AS count
        FROM apartments
        WHERE is_duplicate = FALSE
          AND floor IS NOT NULL
          AND price_per_m2 IS NOT NULL
        GROUP BY floor_num
        HAVING floor_num IS NOT NULL
           AND floor_num BETWEEN 1 AND 30
        ORDER BY floor_num
    """)
    rows = (await db.execute(sql)).all()
    return [
        {
            "floor": r.floor_num,
            "avg_price": int(r.avg_price) if r.avg_price else None,
            "avg_price_per_m2": int(r.avg_price_per_m2) if r.avg_price_per_m2 else None,
            "count": r.count,
        }
        for r in rows
    ]


@router.get("/price-forecast")
async def price_forecast(
    zone: str = Query(None),
    days: int = Query(90, ge=30, le=180),
    db: AsyncSession = Depends(get_db),
):
    """Linear forecast of average price for the next N days based on weekly trend."""
    cutoff = datetime.now() - timedelta(days=days)
    q = (
        select(
            func.date_trunc("week", Apartment.parsed_at).label("week"),
            func.avg(Apartment.price).label("avg_price"),
            func.count(Apartment.id).label("count"),
        )
        .where(Apartment.is_duplicate == False)  # noqa: E712
        .where(Apartment.parsed_at >= cutoff)
        .group_by(func.date_trunc("week", Apartment.parsed_at))
        .order_by(func.date_trunc("week", Apartment.parsed_at))
    )
    if zone:
        from services.zones import zone_filter_clause as zfc
        clause = zfc(zone)
        if clause is not None:
            q = q.where(clause)

    rows = (await db.execute(q)).all()
    if len(rows) < 3:
        return {"zone": zone, "forecast": [], "trend": "insufficient_data"}

    # Simple linear regression on week index vs avg_price
    n = len(rows)
    xs = list(range(n))
    ys = [float(r.avg_price) for r in rows]
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    num = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    den = sum((x - mean_x) ** 2 for x in xs)
    slope = num / den if den != 0 else 0
    intercept = mean_y - slope * mean_x

    # Project next weeks
    forecast = []
    last_week = rows[-1].week
    for i in range(1, (days // 7) + 2):
        week_dt = last_week + timedelta(weeks=i)
        predicted = intercept + slope * (n - 1 + i)
        forecast.append({
            "week": week_dt.strftime("%Y-%m-%d"),
            "predicted_price": max(0, round(predicted)),
        })

    trend = "up" if slope > 0 else ("down" if slope < 0 else "flat")
    weekly_change_pct = round(slope / mean_y * 100, 2) if mean_y > 0 else 0

    return {
        "zone": zone,
        "trend": trend,
        "weekly_change_pct": weekly_change_pct,
        "history": [
            {"week": r.week.strftime("%Y-%m-%d"), "avg_price": round(float(r.avg_price)), "count": r.count}
            for r in rows
        ],
        "forecast": forecast,
    }
