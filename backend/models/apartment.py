from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.sql import func

from config.database import Base


class Apartment(Base):
    __tablename__ = "apartments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    link = Column(String, unique=True, nullable=False, index=True)

    title = Column(String, nullable=False)
    price = Column(Integer, nullable=False)  # KGS
    price_per_m2 = Column(Float)
    address = Column(String)
    rooms = Column(Integer)
    total_area = Column(Float)
    floor = Column(String)
    params = Column(Text)
    source = Column(String, default="lalafo")
    currency = Column(String, default="KGS")
    parsed_at = Column(DateTime(timezone=True), server_default=func.now())
    processed_at = Column(DateTime(timezone=True), server_default=func.now())

    # Quality flags
    is_duplicate = Column(Boolean, default=False, server_default="false")
    duplicate_of_id = Column(Integer, ForeignKey("apartments.id", ondelete="SET NULL"), nullable=True)
    is_price_anomaly = Column(Boolean, default=False, server_default="false")

    # Geocoding
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)

    # Media
    image_url = Column(String, nullable=True)

    # Lifecycle
    first_seen_at = Column(DateTime(timezone=True), nullable=True)
    price_drop_count = Column(Integer, default=0, server_default="0")

    # Amenities
    house_type = Column(String, nullable=True)   # panel / brick / monolith
    has_internet = Column(Boolean, nullable=True)
    has_parking = Column(Boolean, nullable=True)
    is_new_building = Column(Boolean, nullable=True)

    # Full-text search
    search_vector = Column(TSVECTOR, nullable=True)
