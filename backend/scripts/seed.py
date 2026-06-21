"""Seed-скрипт: генерирует правдоподобные демо-данные квартир в БД.

Используется когда парсинг lalafo.kg недоступен (Cloudflare-блокировка).
Создаёт ~200 квартир с реалистичными ценами/площадями/адресами/зонами,
чтобы можно было показать UI: поиск, фильтры, карту, ML, сравнение.

Запуск:
    docker exec -it kyrgpulse-backend python -m scripts.seed
    docker exec -it kyrgpulse-backend python -m scripts.seed --count=300 --reset
"""

import argparse
import asyncio
import random
from datetime import datetime, timedelta

from loguru import logger
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert

from config.database import AsyncSessionLocal, init_db
from models.apartment import Apartment


# Зоны Бишкека: вес = относительная популярность (центр и юг — самые активные)
ZONES = [
    {
        "id": "center",
        "weight": 30,
        "addresses": [
            "ул. Киевская, центр",
            "пр. Чуй, центр",
            "ул. Токтогула",
            "ул. Эркиндик",
            "пр. Манаса, центр",
            "ЦУМ",
            "Ала-Тоо, центр",
        ],
        "price_factor": 1.35,
    },
    {
        "id": "south",
        "weight": 22,
        "addresses": [
            "Джал-29",
            "Джал-23",
            "ул. Асанбая, Джал",
            "Магистраль, Джал",
            "Кок-Жар",
            "ул. Ахунбаева, Джал",
        ],
        "price_factor": 1.10,
    },
    {
        "id": "north",
        "weight": 14,
        "addresses": [
            "Жибек Жолу, север",
            "ул. Манаса, север",
            "Дордой, север",
            "ул. Льва Толстого, север",
        ],
        "price_factor": 0.85,
    },
    {
        "id": "west",
        "weight": 12,
        "addresses": [
            "Ак-Ордо, запад",
            "Арча-Бешик",
            "ул. Кулиева, запад",
            "Ошский рынок",
        ],
        "price_factor": 0.80,
    },
    {
        "id": "east",
        "weight": 12,
        "addresses": [
            "Аламедин-1, восток",
            "Восток-5",
            "Лебединовка",
            "ул. Тыныстанова, восток",
        ],
        "price_factor": 0.90,
    },
    {
        "id": "microdistricts",
        "weight": 30,
        "addresses": [
            "12 мкр",
            "11 мкр",
            "10 мкр",
            "8 мкр",
            "7 мкр",
            "6 мкр",
            "5 мкр",
            "4 мкр",
            "Микрорайон Аламедин",
        ],
        "price_factor": 0.95,
    },
]

# Конфигурация квартир по числу комнат
ROOM_CONFIGS = [
    {"rooms": 0, "weight": 8, "area_range": (18, 32), "base_price": 22000},
    {"rooms": 1, "weight": 28, "area_range": (28, 48), "base_price": 28000},
    {"rooms": 2, "weight": 38, "area_range": (42, 75), "base_price": 38000},
    {"rooms": 3, "weight": 20, "area_range": (60, 110), "base_price": 55000},
    {"rooms": 4, "weight": 6, "area_range": (85, 140), "base_price": 75000},
]

FURNITURE_OPTIONS = [
    ("с мебелью и техникой", 0.55),
    ("без мебели", 0.20),
    ("частично меблирована", 0.20),
    ("", 0.05),
]

CONDITIONS = [
    "евроремонт",
    "после ремонта",
    "хороший ремонт",
    "косметический ремонт",
    "новостройка",
    "под самоотделку",
    "обычное состояние",
]

EXTRAS = [
    "балкон",
    "лоджия",
    "парковка",
    "застеклённый балкон",
    "кондиционер",
    "счётчики",
    "интернет",
    "лифт",
]

DESCRIPTIONS_TEMPLATES = [
    "Сдаётся уютная {rooms_word} квартира в районе {address}. Площадь {area} м², этаж {floor}. {condition}, {furniture}. Есть {extras}. Без посредников, можно с детьми.",
    "{rooms_word} квартира, {area} м², {floor} этаж. {address}. {condition}. {furniture_cap}. {extras_cap}. Только на длительный срок, чисто, тихие соседи.",
    "Срочно сдаю {rooms_word}, {area} м². {address}. {condition}, {furniture}. Рядом школа, садик, остановка. {extras_cap}.",
    "Долгосрочная аренда. {rooms_word} квартира, {area} м², {floor} этаж из {total_floors}. {address}. {condition}. {furniture_cap}.",
]


def weighted_choice(options, weight_key="weight"):
    """Выбор с весами."""
    weights = [o[weight_key] for o in options]
    return random.choices(options, weights=weights, k=1)[0]


def pick_furniture():
    options = [(label, w) for label, w in FURNITURE_OPTIONS]
    labels = [o[0] for o in options]
    weights = [o[1] for o in options]
    return random.choices(labels, weights=weights, k=1)[0]


def rooms_word(rooms: int) -> str:
    if rooms == 0:
        return "студия"
    if rooms == 1:
        return "1-комнатная"
    if rooms == 2:
        return "2-комнатная"
    if rooms == 3:
        return "3-комнатная"
    if rooms == 4:
        return "4-комнатная"
    return f"{rooms}-комнатная"


def generate_apartment(idx: int) -> dict:
    zone = weighted_choice(ZONES)
    room_cfg = weighted_choice(ROOM_CONFIGS)
    rooms = room_cfg["rooms"]

    area = round(random.uniform(*room_cfg["area_range"]), 1)

    # Цена: базовая по комнатам × фактор района × шум
    noise = random.uniform(0.85, 1.20)
    price = int(room_cfg["base_price"] * zone["price_factor"] * noise)
    # Округляем к красивым числам (на 500 KGS)
    price = round(price / 500) * 500
    # Ограничиваем разумным диапазоном
    price = max(12000, min(price, 120000))

    total_floors = random.choice([5, 9, 9, 9, 12, 14, 16])
    floor_num = random.randint(1, total_floors)
    floor = f"{floor_num}/{total_floors}"

    address = random.choice(zone["addresses"])
    if random.random() < 0.4:
        address = f"{address}, {random.choice(['квартал', 'жилмассив', 'дом'])} {random.randint(1, 99)}"

    condition = random.choice(CONDITIONS)
    furniture = pick_furniture()
    extras = ", ".join(random.sample(EXTRAS, k=random.randint(1, 3)))

    rw = rooms_word(rooms)
    title_templates = [
        f"Сдаётся {rw} квартира, {int(area)} м²",
        f"{rw.capitalize()} квартира в {address.split(',')[0]}",
        f"{rw.capitalize()}, {int(area)} м², {floor} этаж",
        f"Аренда {rw.lower()} квартиры — {address.split(',')[0]}",
    ]
    title = random.choice(title_templates)

    desc_template = random.choice(DESCRIPTIONS_TEMPLATES)
    description = desc_template.format(
        rooms_word=rw,
        address=address,
        area=area,
        floor=floor_num,
        total_floors=total_floors,
        condition=condition,
        furniture=furniture or "без мебели",
        furniture_cap=(furniture or "Без мебели").capitalize(),
        extras=extras,
        extras_cap=extras.capitalize(),
    )

    rental_type = "долгосрочная аренда"

    params_parts = [
        f"Комнат: {rooms if rooms > 0 else 'студия'}",
        f"Общая площадь: {area} м²",
        f"Этаж: {floor}",
        f"Состояние: {condition}",
    ]
    if furniture:
        params_parts.append(f"Мебель: {furniture}")
    params_parts.append(f"Тип аренды: {rental_type}")
    params_parts.append(f"Дополнительно: {extras}")
    params = " | ".join(params_parts)

    # Свежие даты — последние 14 дней
    parsed_at = datetime.now() - timedelta(
        days=random.randint(0, 14),
        hours=random.randint(0, 23),
    )

    price_per_m2 = round(price / area, 2) if area else None

    return {
        "link": f"https://lalafo.kg/bishkek/ad/seed-{idx:05d}",
        "title": title,
        "price": price,
        "price_per_m2": price_per_m2,
        "address": address,
        "rooms": rooms,
        "total_area": area,
        "floor": floor,
        "params": f"{params}\n\n{description}",
        "source": "seed",
        "currency": "KGS",
        "parsed_at": parsed_at,
    }


async def seed(count: int, reset: bool):
    await init_db()

    async with AsyncSessionLocal() as session:
        if reset:
            logger.warning("Удаляем все существующие квартиры (--reset)")
            await session.execute(delete(Apartment))
            await session.commit()

        random.seed(42)  # стабильность для повторных запусков
        logger.info(f"Генерируем {count} квартир...")

        inserted = 0
        for i in range(count):
            data = generate_apartment(i)
            stmt = insert(Apartment).values(**data).on_conflict_do_update(
                index_elements=["link"],
                set_={
                    k: v
                    for k, v in data.items()
                    if k not in {"link", "parsed_at"}
                },
            )
            await session.execute(stmt)
            inserted += 1
            if i % 50 == 0 and i > 0:
                await session.commit()
                logger.info(f"  ...{i}/{count}")

        await session.commit()

    logger.success(f"✅ Загружено {inserted} демо-квартир в БД (source=seed)")
    logger.info(
        "Теперь:\n"
        "  - открой http://localhost:3000/search\n"
        "  - обучи модель: curl -X POST http://localhost:8000/api/analytics/train-model"
    )


def main():
    parser = argparse.ArgumentParser(description="Seed demo apartments")
    parser.add_argument("--count", type=int, default=200, help="Сколько квартир сгенерировать")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Удалить все существующие квартиры перед вставкой",
    )
    args = parser.parse_args()

    asyncio.run(seed(args.count, args.reset))


if __name__ == "__main__":
    main()
