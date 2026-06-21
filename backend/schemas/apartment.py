from datetime import datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

SortBy = Literal["price_asc", "price_desc", "date_desc", "area_asc", "area_desc", "deal_asc"]


class ApartmentBase(BaseModel):
    title: str
    price: int
    price_per_m2: Optional[float] = None
    address: Optional[str] = None
    rooms: Optional[int] = None
    total_area: Optional[float] = None
    floor: Optional[str] = None
    params: Optional[str] = None
    source: str = "lalafo"
    currency: str = "KGS"
    link: str


class ApartmentCreate(ApartmentBase):
    parsed_at: datetime


class ApartmentResponse(ApartmentBase):
    id: int
    parsed_at: datetime
    processed_at: Optional[datetime] = None
    is_duplicate: bool = False
    is_price_anomaly: bool = False
    lat: Optional[float] = None
    lng: Optional[float] = None
    image_url: Optional[str] = None
    first_seen_at: Optional[datetime] = None
    price_drop_count: int = 0
    house_type: Optional[str] = None
    has_internet: Optional[bool] = None
    has_parking: Optional[bool] = None
    is_new_building: Optional[bool] = None

    class Config:
        from_attributes = True


class ApartmentFilter(BaseModel):
    """Расширенные фильтры для поиска объявлений."""

    q: Optional[str] = Field(None, description="Текстовый поиск по title/address/params")
    zone: Optional[str] = Field(None, description="ID зоны: center, south, east, west, north, microdistricts")
    min_price: Optional[int] = None
    max_price: Optional[int] = None
    rooms: Optional[int] = Field(None, ge=0, le=10)
    min_area: Optional[float] = None
    max_area: Optional[float] = None
    floor: Optional[int] = Field(None, ge=1, le=60)
    has_area: Optional[bool] = Field(None, description="Только с указанной площадью")
    source: Optional[str] = Field(None, description="Источник: lalafo или house.kg")
    hide_duplicates: bool = Field(True, description="Скрывать дубли объявлений")
    has_internet: Optional[bool] = Field(None, description="Только с интернетом")
    has_parking: Optional[bool] = Field(None, description="Только с парковкой")
    is_new_building: Optional[bool] = Field(None, description="Только новостройки")
    sort: SortBy = "date_desc"
    page: int = Field(1, ge=1)
    limit: int = Field(20, ge=1, le=100)


class ApartmentListResponse(BaseModel):
    items: List[ApartmentResponse]
    total: int
    page: int
    limit: int
    pages: int


class Zone(BaseModel):
    id: str
    label: str
    position: List[float]
    count: int = 0


class ZoneListResponse(BaseModel):
    zones: List[Zone]
    unknown_count: int


class PricePredictionRequest(BaseModel):
    rooms: int = Field(..., ge=0, le=10)
    total_area: float = Field(..., gt=0, le=500)
    floor: Optional[str] = None


class PricePredictionResponse(BaseModel):
    predicted_price: int
    price_per_m2: float
    confidence: Optional[float] = None
    similar_apartments: List[int] = []
    currency: str = "KGS"
    converted_prices: Optional[Dict] = None
    model_status: str = "trained"
    model_mae: Optional[float] = None
    model_r2: Optional[float] = None
    note: Optional[str] = None
