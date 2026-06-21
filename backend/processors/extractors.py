"""Чистые extractors для нормализации raw данных lalafo.kg.

Все функции принимают произвольный набор строк (title, params, address)
и возвращают нормализованное значение или None. Никаких fake fallback
значений — если паттерн не сработал, поле остаётся пустым.
"""

from __future__ import annotations

import re
from typing import Optional, Tuple

from services.zones import ZONES


def _join(*parts: object) -> str:
    """Склеивает части объявления в одну lower-case строку."""
    return " ".join(str(p) for p in parts if p).lower()


# ---------------------------------------------------------------------------
# Площадь
# ---------------------------------------------------------------------------

# Допустимый диапазон площади в м² для отсечения мусора
_AREA_MIN = 10.0
_AREA_MAX = 500.0

_AREA_PATTERNS: tuple[re.Pattern[str], ...] = (
    # "55м2", "55 м²", "55.5 м2", "55,5 кв.м", "55 кв м", "55 квадратов",
    # "55 m2", "55 sq.m"
    re.compile(
        r"(?<![\d.,])(\d{1,3}(?:[.,]\d{1,2})?)\s*"
        r"(?:м\s*[²2]"
        r"|кв\.?\s*м|кв\.?м|м\.?\s*кв"
        r"|квадрат(?:а|ов|ный|ные|ах)?"
        r"|m\s*2|sq\.?\s*m)",
        re.IGNORECASE,
    ),
    # "общая площадь: 55", "площадь 55.5", "area 55"
    re.compile(
        r"(?:площадь|общ\.?\s*пл\.?|общая\s+площадь|area)\s*[:\-]?\s*"
        r"(\d{1,3}(?:[.,]\d{1,2})?)",
        re.IGNORECASE,
    ),
)


def extract_area(*parts: object) -> Optional[float]:
    text = _join(*parts)
    if not text:
        return None
    for pattern in _AREA_PATTERNS:
        for match in pattern.finditer(text):
            raw = match.group(1).replace(",", ".")
            try:
                area = float(raw)
            except ValueError:
                continue
            if _AREA_MIN <= area <= _AREA_MAX:
                return round(area, 2)
    return None


# ---------------------------------------------------------------------------
# Комнаты
# ---------------------------------------------------------------------------

_STUDIO_RE = re.compile(r"\b(студи[яюи]|studio)\b", re.IGNORECASE)

_ROOM_WORD_MAP: dict[str, int] = {
    "однокомнат": 1,
    "двухкомнат": 2,
    "трехкомнат": 3,
    "трёхкомнат": 3,
    "четырехкомнат": 4,
    "четырёхкомнат": 4,
    "пятикомнат": 5,
    "шестикомнат": 6,
}

_ROOM_DIGIT_PATTERNS: tuple[re.Pattern[str], ...] = (
    # "1-комнатная", "2-х комнатной", "2 комн", "3 комнат", "4-комн"
    re.compile(
        r"(?<!\d)([1-9]|10)\s*[-–—]?\s*(?:х|x)?\s*комн(?:атн|атная|атной|ат)?",
        re.IGNORECASE,
    ),
    # "2 ком", "2 ком.", "2к", "2 к."
    re.compile(
        r"(?<!\d)([1-9]|10)\s*(?:комн|ком\.?|к\.?)(?=\b|[\s,.;])",
        re.IGNORECASE,
    ),
    # "2 спальни", "3 bedrooms", "2 rooms"
    re.compile(
        r"(?<!\d)([1-9]|10)\s*(?:спальн[яиеи]|bedroom[s]?|rooms?)",
        re.IGNORECASE,
    ),
)


def extract_rooms(*parts: object) -> Optional[int]:
    text = _join(*parts)
    if not text:
        return None
    if _STUDIO_RE.search(text):
        return 0
    for word, rooms in _ROOM_WORD_MAP.items():
        if word in text:
            return rooms
    for pattern in _ROOM_DIGIT_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        try:
            value = int(match.group(1))
        except ValueError:
            continue
        if 0 < value <= 10:
            return value
    return None


# ---------------------------------------------------------------------------
# Этаж
# ---------------------------------------------------------------------------

_FLOOR_FRACTION_RE = re.compile(r"(?<!\d)(\d{1,2})\s*/\s*(\d{1,2})(?!\d)")

_FLOOR_PATTERNS: tuple[re.Pattern[str], ...] = (
    # "этаж 5", "этажность 5", "floor 3"
    re.compile(r"(?:этаж(?:ность)?|floor)\s*[:\-]?\s*(\d{1,2})", re.IGNORECASE),
    # "5 этаж", "5-й этаж", "на 5 этаже", "5 эт.", "5 этажа"
    re.compile(
        r"(?<!\d)(\d{1,2})\s*[-–]?\s*(?:й|го|ом)?\s*эт(?:аж\w*|\.)",
        re.IGNORECASE,
    ),
    # "3rd floor", "5 floor"
    re.compile(r"(?<!\d)(\d{1,2})\s*(?:rd|nd|st|th)?\s*floor", re.IGNORECASE),
)


def extract_floor(*parts: object) -> Optional[str]:
    text = _join(*parts)
    if not text:
        return None
    fraction = _FLOOR_FRACTION_RE.search(text)
    if fraction:
        floor, total = int(fraction.group(1)), int(fraction.group(2))
        if 0 < floor <= total <= 60:
            return f"{floor}/{total}"
    for pattern in _FLOOR_PATTERNS:
        match = pattern.search(text)
        if not match:
            continue
        try:
            floor = int(match.group(1))
        except ValueError:
            continue
        if 0 < floor <= 60:
            return str(floor)
    return None


# ---------------------------------------------------------------------------
# Цена
# ---------------------------------------------------------------------------

_CURRENCY_TOKENS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("USD", ("$", "usd", "долл", "дол.", "us$")),
    ("EUR", ("€", "eur", "евро")),
    ("RUB", ("₽", "rub", "руб")),
    ("KGS", ("сом", "som", "kgs", "с.")),
)


def _detect_currency(text: str) -> Optional[str]:
    if not text:
        return None
    lowered = text.lower()
    for code, tokens in _CURRENCY_TOKENS:
        if any(token in lowered for token in tokens):
            return code
    return None


def _digits_to_int(value: str) -> Optional[int]:
    digits = re.sub(r"[^\d]", "", value)
    return int(digits) if digits else None


# Цена обязательно рядом с валютой — иначе будет ловить телефоны/года.
# "$500", "500$", "500 USD", "45 000 сом", "45,000 KGS", "€400", "400 €"
_PRICE_AROUND_CURRENCY = re.compile(
    r"(?:(\$|€|₽)\s*(\d[\d\s.,]*)"
    r"|(\d[\d\s.,]*)\s*(\$|€|₽|сом|som|kgs|usd|eur|rub|руб))",
    re.IGNORECASE,
)


def extract_price(*parts: object) -> Tuple[Optional[int], Optional[str]]:
    """Возвращает (amount, currency) или (None, None)."""
    text = _join(*parts)
    if not text:
        return None, None
    for match in _PRICE_AROUND_CURRENCY.finditer(text):
        sym_before, num_after, num_before, sym_after = match.groups()
        raw_num = num_after if sym_before else num_before
        raw_cur = sym_before or sym_after or ""
        amount = _digits_to_int(raw_num or "")
        currency = _detect_currency(raw_cur)
        if amount and amount > 0 and currency:
            return amount, currency
    return None, None


# ---------------------------------------------------------------------------
# Зона / район
# ---------------------------------------------------------------------------

_PRIMARY_ZONE_IDS: tuple[str, ...] = ("center", "south", "east", "west", "north")


def extract_zone(*parts: object) -> Optional[str]:
    """Возвращает zone id из services.zones или None.

    Микрорайоны проверяются последними, чтобы не перебивать основные
    зоны (центр/юг/север и т.д.) при пересечении ключевых слов.
    """
    text = _join(*parts)
    if not text:
        return None
    for zone_id in _PRIMARY_ZONE_IDS:
        zone = next((z for z in ZONES if z["id"] == zone_id), None)
        if zone and any(kw in text for kw in zone["keywords"]):
            return zone_id
    mkr = next((z for z in ZONES if z["id"] == "microdistricts"), None)
    if mkr and any(kw in text for kw in mkr["keywords"]):
        return "microdistricts"
    return None


# ---------------------------------------------------------------------------
# Мебель: "furnished" | "unfurnished" | "partial" | None
# ---------------------------------------------------------------------------

_FURNITURE_NEGATIVE = re.compile(
    r"\b(без\s+мебел[иь]|не\s+меблирован\w*|unfurnished|no\s+furniture)\b",
    re.IGNORECASE,
)
_FURNITURE_PARTIAL = re.compile(
    r"\b("
    r"частичн\w*\s+мебел\w+"
    r"|меблирован\w*\s+частично"
    r"|частично\s+меблирован\w*"
    r"|partly\s+furnished"
    r")\b",
    re.IGNORECASE,
)
_FURNITURE_POSITIVE = re.compile(
    r"\b("
    r"с\s+мебел[иь]ю"
    r"|со\s+всей\s+мебел[иь]ю"
    r"|меблирован\w*"
    r"|мебел[иь]\s+есть"
    r"|есть\s+мебель"
    r"|fully\s+furnished"
    r"|furnished"
    r")\b",
    re.IGNORECASE,
)


def extract_furniture(*parts: object) -> Optional[str]:
    text = _join(*parts)
    if not text:
        return None
    if _FURNITURE_NEGATIVE.search(text):
        return "unfurnished"
    if _FURNITURE_PARTIAL.search(text):
        return "partial"
    if _FURNITURE_POSITIVE.search(text):
        return "furnished"
    return None


# ---------------------------------------------------------------------------
# Тип аренды: "long_term" | "short_term" | None
# ---------------------------------------------------------------------------

_LONG_TERM = re.compile(
    r"\b("
    r"долгосрочн\w*"
    r"|на\s+длительн\w+\s+срок\w*"
    r"|длительн\w+\s+аренд\w*"
    r"|long[-\s]*term"
    r")\b",
    re.IGNORECASE,
)
_SHORT_TERM = re.compile(
    r"\b("
    r"посуточн\w*"
    r"|краткосрочн\w*"
    r"|на\s+сутки"
    r"|на\s+ночь"
    r"|почасов\w*"
    r"|short[-\s]*term"
    r"|daily\s+rent"
    r")\b",
    re.IGNORECASE,
)


def extract_rental_type(*parts: object) -> Optional[str]:
    text = _join(*parts)
    if not text:
        return None
    # short_term проверяется первым: "посуточно" должно перебивать общие фразы про аренду.
    if _SHORT_TERM.search(text):
        return "short_term"
    if _LONG_TERM.search(text):
        return "long_term"
    return None


# ---------------------------------------------------------------------------
# Тип дома: "panel" | "brick" | "monolith" | None
# ---------------------------------------------------------------------------

_HOUSE_PANEL = re.compile(
    r"\b(панел\w*|panel|блочн\w*|блок\b)\b", re.IGNORECASE
)
_HOUSE_BRICK = re.compile(
    r"\b(кирпич\w*|brick|кирп\.?)\b", re.IGNORECASE
)
_HOUSE_MONOLITH = re.compile(
    r"\b(монолит\w*|monolith|каркасно[-\s]монолит\w*)\b", re.IGNORECASE
)


def extract_house_type(*parts: object) -> Optional[str]:
    text = _join(*parts)
    if not text:
        return None
    if _HOUSE_MONOLITH.search(text):
        return "monolith"
    if _HOUSE_BRICK.search(text):
        return "brick"
    if _HOUSE_PANEL.search(text):
        return "panel"
    return None


# ---------------------------------------------------------------------------
# Интернет: True | None
# ---------------------------------------------------------------------------

_INTERNET_RE = re.compile(
    r"\b(интернет|wi[-\s]?fi|wifi|вай[-\s]?фай|ethernet|broadband)\b",
    re.IGNORECASE,
)
_INTERNET_NO_RE = re.compile(
    r"без\s+интернет\w*|no\s+internet|no\s+wi[-\s]?fi",
    re.IGNORECASE,
)


def extract_internet(*parts: object) -> Optional[bool]:
    text = _join(*parts)
    if not text:
        return None
    if _INTERNET_NO_RE.search(text):
        return False
    if _INTERNET_RE.search(text):
        return True
    return None


# ---------------------------------------------------------------------------
# Парковка: True | None
# ---------------------------------------------------------------------------

_PARKING_RE = re.compile(
    r"\b(парковк\w*|паркинг\w*|гараж\w*|parking|garage|машиноместо)\b",
    re.IGNORECASE,
)
_PARKING_NO_RE = re.compile(
    r"без\s+парковк\w*|без\s+гараж\w*|no\s+parking",
    re.IGNORECASE,
)


def extract_parking(*parts: object) -> Optional[bool]:
    text = _join(*parts)
    if not text:
        return None
    if _PARKING_NO_RE.search(text):
        return False
    if _PARKING_RE.search(text):
        return True
    return None


# ---------------------------------------------------------------------------
# Новостройка: True | None
# ---------------------------------------------------------------------------

_NEW_BUILDING_RE = re.compile(
    r"\b(новостройк\w*|новый\s+дом|new\s+build\w*|нов(?:ый|ая|ое)\s+жк|сдан\w*\s+в\s+20[12]\d)\b",
    re.IGNORECASE,
)


def extract_new_building(*parts: object) -> Optional[bool]:
    text = _join(*parts)
    if not text:
        return None
    return True if _NEW_BUILDING_RE.search(text) else None


__all__ = [
    "extract_area",
    "extract_rooms",
    "extract_floor",
    "extract_price",
    "extract_zone",
    "extract_furniture",
    "extract_rental_type",
    "extract_house_type",
    "extract_internet",
    "extract_parking",
    "extract_new_building",
]
