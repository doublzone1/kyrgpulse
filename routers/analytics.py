from typing import Optional
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy import asc, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.types import Date
from loguru import logger

from dependencies.db import get_db
from models.apartment import Apartment
from schemas.apartment import PricePredictionRequest, PricePredictionResponse
from ml.model import PricePredictor
from ml.recommender import Recommender
from ml.analytics import AnalyticsService
from ml.trainer import PricePredictorTrainer
from services.currency_service import currency_service
from services.zones import ZONES, zone_filter_clause

ANALYTICS_ROUTER_VERSION = "v2"

router = APIRouter(prefix="/api/analytics", tags=["Analytics & ML"])

predictor = PricePredictor()
recommender = Recommender()
analytics = AnalyticsService()


@router.post("/predict", response_model=PricePredictionResponse)
async def predict_price(request: PricePredictionRequest, db: AsyncSession = Depends(get_db)):
    try:
        pred = predictor.predict(
            rooms=request.rooms,
            total_area=request.total_area,
            floor=request.floor or "1"
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    similar = await recommender.get_similar(
        db,
        {"rooms": request.rooms, "total_area": request.total_area, "price": pred["predicted_price"]}
    )

    rates = await currency_service.get_rates()
    converted = currency_service.convert_price(pred["predicted_price"], rates)

    return {
        "predicted_price": pred["predicted_price"],
        "price_per_m2": pred["price_per_m2"],
        "confidence": pred.get("confidence"),
        "similar_apartments": [s["apartment_id"] for s in similar[:3]],
        "currency": "KGS",
        "converted_prices": converted,
        "model_status": pred.get("model_status", "trained"),
        "model_mae": pred.get("model_mae"),
        "model_r2": pred.get("model_r2"),
        "note": pred.get("note"),
    }


@router.get("/distribution")
async def price_distribution(db: AsyncSession = Depends(get_db)):
    return await analytics.get_price_distribution(db)


@router.post("/train-model")
async def train_model(db: AsyncSession = Depends(get_db)):
    logger.info(f"ANALYTICS ROUTER VERSION {ANALYTICS_ROUTER_VERSION}")
    trainer = PricePredictorTrainer()
    result = await trainer.train(db)
    result["analytics_router_version"] = ANALYTICS_ROUTER_VERSION
    logger.info(f"train_model result keys={list(result.keys())}")
    if result.get("status") != "success":
        # Используем JSONResponse, чтобы отдать полный объект целиком,
        # а не оборачивать его в {"detail": ...} как делает HTTPException.
        return JSONResponse(status_code=400, content=result)
    predictor._load_model()
    return result


@router.get("/price-trend")
async def get_price_trend(
    days: int = Query(default=30, ge=7, le=365),
    rooms: Optional[int] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Средняя цена объявлений по дням за последние N дней.

    Используется для графика динамики цен на дашборде.
    Фильтрует ценовые аномалии (5 000 – 1 000 000 KGS).
    """
    cutoff = datetime.now() - timedelta(days=days - 1)
    day_col = cast(Apartment.parsed_at, Date).label("day")

    query = (
        select(
            day_col,
            func.round(func.avg(Apartment.price)).label("avg_price"),
            func.count(Apartment.id).label("count"),
        )
        .where(
            Apartment.parsed_at >= cutoff,
            Apartment.price.between(5_000, 1_000_000),
        )
        .group_by(day_col)
        .order_by(asc(day_col))
    )

    if rooms is not None:
        query = query.where(Apartment.rooms == rooms)

    rows = (await db.execute(query)).all()
    return {
        "trend": [
            {
                "date": str(r.day),
                "avg_price": int(r.avg_price or 0),
                "count": r.count,
            }
            for r in rows
        ]
    }


@router.get("/zones-comparison")
async def get_zones_comparison(db: AsyncSession = Depends(get_db)):
    """Средние цены по зонам Бишкека для таблицы сравнения районов."""
    result = []
    for zone in ZONES:
        clause = zone_filter_clause(zone["id"])
        if clause is None:
            continue
        row = (await db.execute(
            select(
                func.count(Apartment.id).label("count"),
                func.avg(Apartment.price).label("avg_price"),
                func.min(Apartment.price).label("min_price"),
                func.max(Apartment.price).label("max_price"),
                func.avg(Apartment.price_per_m2).label("avg_ppm2"),
            ).where(clause, Apartment.price.between(5_000, 1_000_000))
        )).first()

        result.append({
            "zone_id": zone["id"],
            "label": zone["label"],
            "count": int(row.count) if row else 0,
            "avg_price": round(float(row.avg_price)) if row and row.avg_price else None,
            "min_price": int(row.min_price) if row and row.min_price else None,
            "max_price": int(row.max_price) if row and row.max_price else None,
            "avg_price_per_m2": round(float(row.avg_ppm2)) if row and row.avg_ppm2 else None,
        })

    return {"zones": result}


@router.get("/currency/rates")
async def get_currency_rates():
    rates = await currency_service.get_rates()
    meta = currency_service.get_rates_meta()
    return {
        "base": "KGS",
        "rates": rates,
        "timestamp": datetime.now().isoformat(),
        "source": meta["source"],
        "updated_at": meta["updated_at"],
        "warning": meta["warning"],
    }
