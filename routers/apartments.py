import csv
import io
import math
from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import Select, asc, cast, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.types import Date

from dependencies.db import get_db
from models.apartment import Apartment
from models.price_history import PriceHistory
from schemas.apartment import (
    ApartmentFilter,
    ApartmentListResponse,
    ApartmentResponse,
    ZoneListResponse,
)
from services.currency_service import currency_service
from services.zones import ZONES, zone_filter_clause

router = APIRouter(prefix="/api/apartments", tags=["Apartments"])


def _apply_filters(query: Select, filters: ApartmentFilter) -> Select:
    if filters.q:
        pattern = f"%{filters.q.lower()}%"
        query = query.where(
            or_(
                func.lower(Apartment.title).like(pattern),
                func.lower(func.coalesce(Apartment.address, "")).like(pattern),
                func.lower(func.coalesce(Apartment.params, "")).like(pattern),
            )
        )

    if filters.zone:
        clause = zone_filter_clause(filters.zone)
        if clause is not None:
            query = query.where(clause)

    if filters.min_price is not None:
        query = query.where(Apartment.price >= filters.min_price)
    if filters.max_price is not None:
        query = query.where(Apartment.price <= filters.max_price)

    if filters.rooms is not None:
        query = query.where(Apartment.rooms == filters.rooms)

    if filters.min_area is not None:
        query = query.where(Apartment.total_area >= filters.min_area)
    if filters.max_area is not None:
        query = query.where(Apartment.total_area <= filters.max_area)

    if filters.has_area:
        query = query.where(Apartment.total_area.is_not(None))

    if filters.floor is not None:
        # floor хранится как строка вида "5" или "5/9"
        query = query.where(Apartment.floor.like(f"{filters.floor}%"))

    return query


def _apply_sorting(query: Select, sort: str) -> Select:
    if sort == "price_asc":
        return query.order_by(asc(Apartment.price))
    if sort == "price_desc":
        return query.order_by(desc(Apartment.price))
    if sort == "area_asc":
        return query.order_by(asc(Apartment.total_area).nulls_last())
    if sort == "area_desc":
        return query.order_by(desc(Apartment.total_area).nulls_last())
    return query.order_by(desc(Apartment.processed_at))


@router.get("/", response_model=ApartmentListResponse)
async def search_apartments(
    filters: ApartmentFilter = Depends(),
    db: AsyncSession = Depends(get_db),
):
    base = select(Apartment)
    base = _apply_filters(base, filters)

    total = await db.scalar(
        select(func.count()).select_from(base.subquery())
    ) or 0

    query = _apply_sorting(base, filters.sort)
    query = query.offset((filters.page - 1) * filters.limit).limit(filters.limit)

    result = await db.execute(query)
    items = result.scalars().all()

    pages = max(1, math.ceil(total / filters.limit)) if filters.limit else 1
    return {
        "items": items,
        "total": total,
        "page": filters.page,
        "limit": filters.limit,
        "pages": pages,
    }


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    total = await db.scalar(select(func.count(Apartment.id)))
    avg_price = await db.scalar(select(func.avg(Apartment.price)))
    avg_area = await db.scalar(select(func.avg(Apartment.total_area)))

    avg_price_kgs = round(float(avg_price), 2) if avg_price else 0
    rates = await currency_service.get_rates()
    converted = (
        currency_service.convert_price(avg_price_kgs, rates) if avg_price else {}
    )
    rates_meta = currency_service.get_rates_meta()

    return {
        "total_apartments": total or 0,
        "average_price": avg_price_kgs,
        "average_area": round(float(avg_area), 2) if avg_area else 0,
        "currency": "KGS",
        "converted_prices": converted,
        "rates_source": rates_meta["source"],
        "rates_warning": rates_meta["warning"],
        "last_update": "последние обработанные данные из lalafo.kg",
    }


@router.get("/data-quality")
async def get_data_quality(db: AsyncSession = Depends(get_db)):
    """Метрики качества данных и парсинг-pipeline.

    Что отдаёт:
    - total: сколько объявлений в БД
    - last_processed_at / last_parsed_at: когда последний раз обновлялись
    - coverage: % заполненных по каждому полю (rooms, area, floor, address, ppm)
    - sources: разбивка по источникам (lalafo / seed / ...)
    - timeline: количество объявлений по дням за последние 14 дней
    - valid_for_ml: сколько строк имеют все нужные для обучения поля
    """
    total = await db.scalar(select(func.count(Apartment.id))) or 0

    if total == 0:
        return {
            "total": 0,
            "last_processed_at": None,
            "last_parsed_at": None,
            "coverage": {},
            "sources": [],
            "timeline": [],
            "valid_for_ml": {"count": 0, "pct": 0.0},
        }

    last_processed = await db.scalar(select(func.max(Apartment.processed_at)))
    last_parsed = await db.scalar(select(func.max(Apartment.parsed_at)))

    fields = [
        ("rooms", Apartment.rooms),
        ("total_area", Apartment.total_area),
        ("floor", Apartment.floor),
        ("address", Apartment.address),
        ("price_per_m2", Apartment.price_per_m2),
        ("params", Apartment.params),
    ]
    coverage: dict[str, dict] = {}
    for name, column in fields:
        # Считаем "заполненным" значение, которое не NULL и не пустая строка
        if column.type.python_type is str:
            non_null = await db.scalar(
                select(func.count()).where(column.is_not(None), column != "")
            )
        else:
            non_null = await db.scalar(
                select(func.count()).where(column.is_not(None))
            )
        non_null = non_null or 0
        coverage[name] = {
            "non_null": int(non_null),
            "pct": round(100 * non_null / total, 1),
        }

    valid_for_ml = await db.scalar(
        select(func.count()).where(
            Apartment.rooms.is_not(None),
            Apartment.total_area.is_not(None),
            Apartment.price.is_not(None),
        )
    ) or 0

    # Источники
    sources_rows = (
        await db.execute(
            select(
                Apartment.source,
                func.count(Apartment.id).label("count"),
                func.avg(Apartment.price).label("avg_price"),
            )
            .group_by(Apartment.source)
            .order_by(desc("count"))
        )
    ).all()
    sources = [
        {
            "source": row.source or "unknown",
            "count": int(row.count),
            "avg_price": int(row.avg_price) if row.avg_price else None,
        }
        for row in sources_rows
    ]

    # Timeline: объявлений по дням (по processed_at) за последние 14 дней
    cutoff = datetime.now() - timedelta(days=13)
    day_col = cast(Apartment.processed_at, Date).label("day")
    timeline_rows = (
        await db.execute(
            select(day_col, func.count(Apartment.id).label("count"))
            .where(Apartment.processed_at >= cutoff)
            .group_by(day_col)
            .order_by(asc(day_col))
        )
    ).all()

    # Нормализуем: даже дни без объявлений показываем как 0,
    # чтобы график на frontend выглядел сплошным.
    by_day = {row.day.isoformat(): int(row.count) for row in timeline_rows}
    timeline: list[dict] = []
    for i in range(14):
        day = (cutoff + timedelta(days=i)).date()
        timeline.append(
            {"date": day.isoformat(), "count": by_day.get(day.isoformat(), 0)}
        )

    return {
        "total": int(total),
        "last_processed_at": last_processed.isoformat() if last_processed else None,
        "last_parsed_at": last_parsed.isoformat() if last_parsed else None,
        "coverage": coverage,
        "sources": sources,
        "timeline": timeline,
        "valid_for_ml": {
            "count": int(valid_for_ml),
            "pct": round(100 * valid_for_ml / total, 1),
        },
    }


@router.get("/zones", response_model=ZoneListResponse)
async def get_zones(db: AsyncSession = Depends(get_db)):
    """Зоны Бишкека с количеством объявлений в каждой."""
    total = await db.scalar(select(func.count(Apartment.id))) or 0
    counted = 0

    zones_out = []
    for zone in ZONES:
        clause = zone_filter_clause(zone["id"])
        count = await db.scalar(
            select(func.count(Apartment.id)).where(clause)
        ) or 0
        counted += count
        zones_out.append(
            {
                "id": zone["id"],
                "label": zone["label"],
                "position": zone["position"],
                "count": count,
            }
        )

    # microdistricts могут пересекаться с другими зонами — это ожидаемо.
    # unknown_count = объявления без распознанной зоны (грубая оценка по center+south+east+west+north).
    primary_ids = {"center", "south", "east", "west", "north"}
    primary_total = sum(z["count"] for z in zones_out if z["id"] in primary_ids)
    unknown = max(0, total - primary_total)

    return {"zones": zones_out, "unknown_count": unknown}


@router.get("/export")
async def export_apartments_csv(
    filters: ApartmentFilter = Depends(),
    db: AsyncSession = Depends(get_db),
):
    """Экспорт результатов поиска в CSV (макс. 2 000 строк)."""
    base = select(Apartment)
    base = _apply_filters(base, filters)
    query = _apply_sorting(base, filters.sort).limit(2000)
    rows = (await db.execute(query)).scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id", "title", "price", "price_per_m2", "rooms", "total_area",
        "floor", "address", "source", "link", "parsed_at",
    ])
    for r in rows:
        writer.writerow([
            r.id, r.title, r.price, r.price_per_m2 or "",
            r.rooms or "", r.total_area or "", r.floor or "",
            r.address or "", r.source, r.link,
            r.parsed_at.isoformat() if r.parsed_at else "",
        ])

    content = output.getvalue().encode("utf-8-sig")  # BOM for Excel
    return StreamingResponse(
        io.BytesIO(content),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="kyrgpulse_apartments.csv"'},
    )


@router.get("/{apartment_id}", response_model=ApartmentResponse)
async def get_apartment_by_id(
    apartment_id: int, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Apartment).where(Apartment.id == apartment_id)
    )
    apartment = result.scalar_one_or_none()
    if not apartment:
        raise HTTPException(status_code=404, detail="Квартира не найдена")
    return apartment


@router.get("/{apartment_id}/price-history")
async def get_price_history(
    apartment_id: int,
    db: AsyncSession = Depends(get_db),
):
    """История изменений цены объявления."""
    apt = await db.get(Apartment, apartment_id)
    if not apt:
        raise HTTPException(status_code=404, detail="Квартира не найдена")

    result = await db.execute(
        select(PriceHistory)
        .where(PriceHistory.apartment_id == apartment_id)
        .order_by(asc(PriceHistory.recorded_at))
    )
    history = result.scalars().all()

    return {
        "apartment_id": apartment_id,
        "current_price": apt.price,
        "history": [
            {
                "price": h.price,
                "recorded_at": h.recorded_at.isoformat(),
                "change_pct": h.change_pct,
            }
            for h in history
        ],
    }


@router.get("/{apartment_id}/similar", response_model=List[ApartmentResponse])
async def get_similar_apartments(
    apartment_id: int,
    limit: int = 6,
    db: AsyncSession = Depends(get_db),
):
    """Похожие квартиры по комнатам, цене и площади."""
    result = await db.execute(
        select(Apartment).where(Apartment.id == apartment_id)
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Квартира не найдена")

    price_low = int(target.price * 0.75)
    price_high = int(target.price * 1.25)

    query = select(Apartment).where(Apartment.id != target.id)
    query = query.where(Apartment.price.between(price_low, price_high))
    if target.rooms is not None:
        query = query.where(Apartment.rooms == target.rooms)
    if target.total_area:
        query = query.where(
            Apartment.total_area.between(
                target.total_area * 0.7, target.total_area * 1.3
            )
        )

    # Сортируем по близости цены к таргету
    query = query.order_by(
        func.abs(Apartment.price - target.price).asc()
    ).limit(limit)

    res = await db.execute(query)
    items = res.scalars().all()

    if len(items) >= 3:
        return items

    # Фоллбек: ослабляем фильтр площади, если не хватило
    fallback = select(Apartment).where(
        Apartment.id != target.id,
        Apartment.price.between(price_low, price_high),
    )
    if target.rooms is not None:
        fallback = fallback.where(Apartment.rooms == target.rooms)
    fallback = fallback.order_by(
        func.abs(Apartment.price - target.price).asc()
    ).limit(limit)

    res = await db.execute(fallback)
    return res.scalars().all()
