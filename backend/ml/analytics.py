from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from models.apartment import Apartment
from loguru import logger


class AnalyticsService:
    async def get_price_distribution(self, db: AsyncSession):
        query = (
            select(
                Apartment.rooms,
                func.avg(Apartment.price).label("avg_price"),
                func.count(Apartment.id).label("count")
            )
            .group_by(Apartment.rooms)
            .order_by(Apartment.rooms)
        )
        result = await db.execute(query)
        data = result.mappings().all()
        return [
            {
                "rooms": r.rooms,
                "avg_price": round(float(r.avg_price), 2),
                "count": r.count
            } for r in data
        ]
