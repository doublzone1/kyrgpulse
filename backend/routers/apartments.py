from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from dependencies.db import get_db
from models.apartment import Apartment
from models.price_history import PriceHistory
from ml.recommender import Recommender
from schemas.apartment import (
    ApartmentFilter,
    ApartmentListResponse,
    ApartmentResponse,
)
from services.zones import zone_filter_clause

router = APIRouter(prefix="/apartments", tags=["apartments"])
_recommender = Recommender()


def _build_query(filters: ApartmentFilter):
    q = select(Apartment)

    if filters.hide_duplicates:
        q = q.where(Apartment.is_duplicate == False)  # noqa: E712

    if filters.source:
        q = q.where(Apartment.source == filters.source)

    if filters.q:
        term = f"%{filters.q.lower()}%"
        q = q.where(
            or_(
                Apartment.search_vector.op("@@")(
                    func.plainto_tsquery("russian", filters.q)
                ),
                func.lower(Apartment.title).like(term),
            )
        )

    if filters.zone:
        clause = zone_filter_clause(filters.zone)
        if clause is not None:
            q = q.where(clause)

    if filters.min_price is not None:
        q = q.where(Apartment.price >= filters.min_price)
    if filters.max_price is not None:
        q = q.where(Apartment.price <= filters.max_price)
    if filters.rooms is not None:
        q = q.where(Apartment.rooms == filters.rooms)
    if filters.min_area is not None:
        q = q.where(Apartment.total_area >= filters.min_area)
    if filters.max_area is not None:
        q = q.where(Apartment.total_area <= filters.max_area)
    if filters.has_area is not None:
        if filters.has_area:
            q = q.where(Apartment.total_area.isnot(None))
        else:
            q = q.where(Apartment.total_area.is_(None))
    if filters.floor is not None:
        q = q.where(Apartment.floor == str(filters.floor))
    if filters.has_internet is not None:
        q = q.where(Apartment.has_internet == filters.has_internet)
    if filters.has_parking is not None:
        q = q.where(Apartment.has_parking == filters.has_parking)
    if filters.is_new_building is not None:
        q = q.where(Apartment.is_new_building == filters.is_new_building)

    if filters.sort == "deal_asc":
        # Best deals: non-anomaly first, then cheapest per m²
        q = q.order_by(
            case((Apartment.is_price_anomaly == True, 1), else_=0).asc(),  # noqa: E712
            Apartment.price_per_m2.asc().nullslast(),
        )
    else:
        sort_map = {
            "price_asc": Apartment.price.asc(),
            "price_desc": Apartment.price.desc(),
            "date_desc": Apartment.parsed_at.desc(),
            "area_asc": Apartment.total_area.asc(),
            "area_desc": Apartment.total_area.desc(),
        }
        q = q.order_by(sort_map.get(filters.sort, Apartment.parsed_at.desc()))
    return q


@router.get("", response_model=ApartmentListResponse)
async def list_apartments(
    q: Optional[str] = None,
    zone: Optional[str] = None,
    min_price: Optional[int] = None,
    max_price: Optional[int] = None,
    rooms: Optional[int] = None,
    min_area: Optional[float] = None,
    max_area: Optional[float] = None,
    floor: Optional[int] = None,
    has_area: Optional[bool] = None,
    source: Optional[str] = None,
    hide_duplicates: bool = True,
    has_internet: Optional[bool] = None,
    has_parking: Optional[bool] = None,
    is_new_building: Optional[bool] = None,
    sort: str = "date_desc",
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    filters = ApartmentFilter(
        q=q, zone=zone, min_price=min_price, max_price=max_price,
        rooms=rooms, min_area=min_area, max_area=max_area, floor=floor,
        has_area=has_area, source=source, hide_duplicates=hide_duplicates,
        has_internet=has_internet, has_parking=has_parking, is_new_building=is_new_building,
        sort=sort, page=page, limit=limit,  # type: ignore[arg-type]
    )
    base_q = _build_query(filters)

    count_result = await db.execute(select(func.count()).select_from(base_q.subquery()))
    total = count_result.scalar_one()

    offset = (filters.page - 1) * filters.limit
    result = await db.execute(base_q.offset(offset).limit(filters.limit))
    items = result.scalars().all()

    return ApartmentListResponse(
        items=items,
        total=total,
        page=filters.page,
        limit=filters.limit,
        pages=max(1, -(-total // filters.limit)),
    )


@router.get("/{apartment_id}", response_model=ApartmentResponse)
async def get_apartment(apartment_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Apartment).where(Apartment.id == apartment_id))
    apt = result.scalar_one_or_none()
    if not apt:
        raise HTTPException(status_code=404, detail="Объявление не найдено")
    return apt


@router.get("/{apartment_id}/price-history")
async def get_price_history(apartment_id: int, db: AsyncSession = Depends(get_db)):
    apt_result = await db.execute(select(Apartment).where(Apartment.id == apartment_id))
    apt = apt_result.scalar_one_or_none()
    if not apt:
        raise HTTPException(status_code=404, detail="Объявление не найдено")

    history_result = await db.execute(
        select(PriceHistory)
        .where(PriceHistory.apartment_id == apartment_id)
        .order_by(PriceHistory.recorded_at.asc())
    )
    history = history_result.scalars().all()
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


@router.get("/{apartment_id}/similar")
async def similar_apartments(apartment_id: int, db: AsyncSession = Depends(get_db)):
    apt_result = await db.execute(select(Apartment).where(Apartment.id == apartment_id))
    apt = apt_result.scalar_one_or_none()
    if not apt:
        raise HTTPException(status_code=404, detail="Объявление не найдено")

    target = {
        "id": apt.id,
        "rooms": apt.rooms,
        "total_area": apt.total_area,
        "price": apt.price,
    }
    similar = await _recommender.get_similar(db, target)
    return {"items": similar}
