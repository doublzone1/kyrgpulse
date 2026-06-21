from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer
from sqlalchemy.sql import func

from config.database import Base


class PriceHistory(Base):
    __tablename__ = "price_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    apartment_id = Column(
        Integer,
        ForeignKey("apartments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    price = Column(Integer, nullable=False)
    change_pct = Column(Float)
    recorded_at = Column(DateTime(timezone=True), server_default=func.now())
