"""Зоны Бишкека для фильтрации и группировки объявлений.

Координаты приблизительные — для маркеров на карте.
Ключевые слова — для определения зоны по тексту адреса/заголовка.
"""

from typing import Optional

from sqlalchemy import ColumnElement, func, or_

from models.apartment import Apartment

ZONES: list[dict] = [
    {
        "id": "center",
        "label": "Центр",
        "position": [42.875, 74.604],
        "keywords": [
            "центр",
            "ала-тоо",
            "цум",
            "гум",
            "киевская",
            "токтогула",
            "эркиндик",
        ],
    },
    {
        "id": "south",
        "label": "Южная часть",
        "position": [42.835, 74.615],
        "keywords": [
            "южн",
            "магистраль",
            "асанбе",
            "кок-жар",
            "кок жар",
            "джал",
            "жал",
        ],
    },
    {
        "id": "east",
        "label": "Восточная часть",
        "position": [42.865, 74.68],
        "keywords": [
            "восток",
            "аламедин",
            "лебединовка",
            "ташырабат",
            "ташы рабат",
        ],
    },
    {
        "id": "west",
        "label": "Западная часть",
        "position": [42.88, 74.52],
        "keywords": [
            "запад",
            "ошский",
            "кулиева",
            "ак-ордо",
            "ак ордо",
            "арча-бешик",
        ],
    },
    {
        "id": "north",
        "label": "Северная часть",
        "position": [42.91, 74.6],
        "keywords": ["север", "дордой", "манас", "жибек жолу"],
    },
    {
        "id": "microdistricts",
        "label": "Микрорайоны",
        "position": [42.845, 74.585],
        "keywords": ["мкр", "микрорайон"],
    },
]


def get_zone(zone_id: str) -> Optional[dict]:
    return next((z for z in ZONES if z["id"] == zone_id), None)


def _searchable_text() -> ColumnElement[str]:
    """Конкатенация address + title в нижнем регистре для ILIKE-поиска."""
    return func.lower(
        func.concat(
            func.coalesce(Apartment.address, ""),
            " ",
            func.coalesce(Apartment.title, ""),
        )
    )


def zone_filter_clause(zone_id: str) -> Optional[ColumnElement[bool]]:
    """SQL-условие для фильтрации объявлений по зоне."""
    zone = get_zone(zone_id)
    if not zone:
        return None
    text = _searchable_text()
    return or_(*[text.like(f"%{kw}%") for kw in zone["keywords"]])
