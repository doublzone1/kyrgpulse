"""Smoke-тест для extractors.py — запускается отдельно, чтобы убедиться,
что все заявленные форматы покрыты. Файл одноразовый, его потом можно удалить.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# services.zones импортируется extractors'ом, но в smoke-тесте services
# может быть недоступен — подсунем минимальный заглушечный модуль.
import types

zones_stub = types.ModuleType("services.zones")
zones_stub.ZONES = [
    {"id": "center", "keywords": ["центр"]},
    {"id": "south", "keywords": ["джал"]},
    {"id": "east", "keywords": ["восток"]},
    {"id": "west", "keywords": ["запад"]},
    {"id": "north", "keywords": ["север"]},
    {"id": "microdistricts", "keywords": ["мкр", "микрорайон"]},
]
services_pkg = types.ModuleType("services")
services_pkg.zones = zones_stub
sys.modules.setdefault("services", services_pkg)
sys.modules.setdefault("services.zones", zones_stub)

from processors.extractors import (  # noqa: E402
    extract_area,
    extract_floor,
    extract_furniture,
    extract_price,
    extract_rental_type,
    extract_rooms,
    extract_zone,
)

CASES = [
    ("area 55м2", extract_area, ("55м2",), 55.0),
    ("area 55 м²", extract_area, ("55 м²",), 55.0),
    ("area 55 квадратов", extract_area, ("квартира 55 квадратов в центре",), 55.0),
    ("area 55.5 кв.м", extract_area, ("55.5 кв.м",), 55.5),
    ("area 55,5 m2", extract_area, ("55,5 m2",), 55.5),
    ("area noise", extract_area, ("телефон 555 5555",), None),
    ("area too small", extract_area, ("5 м²",), None),
    ("area too big", extract_area, ("9999 м²",), None),
    ("rooms 2-комнатная", extract_rooms, ("2-комнатная квартира",), 2),
    ("rooms 2 ком", extract_rooms, ("сдается 2 ком в центре",), 2),
    ("rooms 2-х комнатная", extract_rooms, ("сдаю 2-х комнатную",), 2),
    ("rooms studio", extract_rooms, ("уютная студия в центре",), 0),
    ("rooms 3 спальни", extract_rooms, ("дом 3 спальни",), 3),
    ("rooms трехкомнатная", extract_rooms, ("трехкомнатная квартира",), 3),
    ("rooms 3к", extract_rooms, ("3к, мебель, ремонт",), 3),
    ("floor 3/9", extract_floor, ("3/9 этаж",), "3/9"),
    ("floor 5 эт.", extract_floor, ("5 эт. кирпичный дом",), "5"),
    ("floor этаж 3", extract_floor, ("этаж 3 из 9",), "3"),
    ("floor 3rd floor", extract_floor, ("3rd floor brick house",), "3"),
    ("floor noise", extract_floor, ("год постройки 2020",), None),
    ("price 45000 сом", extract_price, ("45 000 сом в месяц",), (45000, "KGS")),
    ("price $500", extract_price, ("$500 в месяц",), (500, "USD")),
    ("price 500 USD", extract_price, ("500 USD per month",), (500, "USD")),
    ("price 400€", extract_price, ("400€",), (400, "EUR")),
    ("price 30000 руб", extract_price, ("30 000 руб",), (30000, "RUB")),
    ("price no currency", extract_price, ("стоит 100",), (None, None)),
    ("furn yes", extract_furniture, ("с мебелью и техникой",), "furnished"),
    ("furn no", extract_furniture, ("сдается без мебели",), "unfurnished"),
    ("furn partial", extract_furniture, ("частично меблирована",), "partial"),
    ("furn unknown", extract_furniture, ("красивая квартира",), None),
    ("rental long", extract_rental_type, ("долгосрочная аренда",), "long_term"),
    ("rental short", extract_rental_type, ("посуточно сдаю",), "short_term"),
    ("rental hour", extract_rental_type, ("почасовая",), "short_term"),
    ("rental unknown", extract_rental_type, ("сдается квартира",), None),
    ("zone center", extract_zone, ("центр Бишкека",), "center"),
    ("zone south", extract_zone, ("джал-29",), "south"),
    ("zone mkr", extract_zone, ("12 мкр",), "microdistricts"),
    ("zone center wins over mkr", extract_zone, ("центр, рядом с мкр",), "center"),
    ("zone unknown", extract_zone, ("просто текст",), None),
    ("empty area", extract_area, ("",), None),
    ("empty rooms", extract_rooms, (None,), None),
]

passed = 0
failed = []
for name, fn, args, expected in CASES:
    got = fn(*args)
    if got == expected:
        passed += 1
    else:
        failed.append((name, args, expected, got))

print(f"PASSED: {passed}/{len(CASES)}")
for name, args, expected, got in failed:
    print(f"FAIL  [{name}] args={args!r} expected={expected!r} got={got!r}")

if failed:
    sys.exit(1)
