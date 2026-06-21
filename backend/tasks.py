import asyncio
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from celery import Celery
from celery.schedules import crontab
from loguru import logger

from config.settings import settings


async def _send_telegram_alert(text: str) -> None:
    """Отправляет сообщение в Telegram-чат администратора."""
    token = settings.TELEGRAM_BOT_TOKEN
    chat_id = settings.TELEGRAM_ADMIN_CHAT_ID
    if not token or not chat_id:
        return
    try:
        import httpx
        url = f"https://api.telegram.org/bot{token}/sendMessage"
        async with httpx.AsyncClient(timeout=8) as client:
            await client.post(url, json={
                "chat_id": chat_id,
                "text": f"⚠️ <b>KyrgPulse Alert</b>\n\n{text}",
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            })
    except Exception as exc:
        logger.warning(f"Telegram alert failed: {exc}")

celery = Celery(
    "kyrgpulse",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["tasks"],
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Bishkek",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=1800,
    worker_max_tasks_per_child=10,
)


@celery.task(name="tasks.parse_and_process", bind=True)
def parse_and_process(self):
    """Сбор объявлений с lalafo.kg + house.kg и загрузка в БД."""
    import pandas as pd
    from config.settings import settings

    start_time = datetime.now()
    logger.info("Запущена задача автопарсинга KyrgPulse (lalafo + house.kg)")

    frames: list = []
    source_counts: dict = {}

    # --- lalafo.kg ---
    try:
        from parsers.lalafo_parser import LalafoParser

        df_lalafo = asyncio.run(LalafoParser().run())
        if df_lalafo is not None and len(df_lalafo) > 0:
            frames.append(df_lalafo)
            source_counts["lalafo"] = len(df_lalafo)
            logger.success(f"lalafo.kg: {len(df_lalafo)} объявлений")
        else:
            logger.warning("lalafo.kg: парсер не вернул данные")
    except Exception as exc:
        logger.error(f"lalafo.kg: ошибка парсинга: {exc}")

    # --- house.kg ---
    try:
        from parsers.house_kg_parser import run as run_house_kg

        df_house = run_house_kg()
        if df_house is not None and len(df_house) > 0:
            frames.append(df_house)
            source_counts["house.kg"] = len(df_house)
            logger.success(f"house.kg: {len(df_house)} объявлений")
        else:
            logger.warning("house.kg: парсер не вернул данные")
    except Exception as exc:
        logger.error(f"house.kg: ошибка парсинга: {exc}")

    if not frames:
        logger.warning("Все парсеры вернули пустой результат")
        asyncio.run(_send_telegram_alert("Все парсеры вернули пустой результат. Проверьте lalafo.kg и house.kg."))
        return {"status": "warning", "message": "Нет новых объявлений", "sources": {}}

    combined = pd.concat(frames, ignore_index=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    combined_path = settings.RAW_DATA / f"lalafo_raw_{timestamp}.parquet"
    combined.to_parquet(combined_path, index=False)
    logger.info(f"Объединённый файл: {combined_path.name} ({len(combined)} строк)")

    try:
        from processors.data_processor import DataProcessor

        asyncio.run(DataProcessor().process())
    except Exception as exc:
        logger.error(f"DataProcessor: ошибка обработки: {exc}")
        asyncio.run(_send_telegram_alert(f"Ошибка DataProcessor:\n<code>{exc}</code>"))
        raise self.retry(exc=exc, countdown=60 * 5)

    duration = (datetime.now() - start_time).total_seconds()
    total = len(combined)
    logger.success(f"Автопарсинг завершён за {duration:.1f} сек. Всего: {total}")

    return {
        "status": "success",
        "total_parsed": total,
        "sources": source_counts,
        "duration_seconds": round(duration, 1),
        "timestamp": datetime.now().isoformat(),
    }


@celery.task(name="tasks.notify_telegram_subscribers", bind=True, max_retries=2)
def notify_telegram_subscribers(self):
    """Ищет новые объявления и снижения цен, уведомляет подписчиков Telegram."""

    async def _run() -> dict:
        import httpx
        import json as _json
        from config.database import AsyncSessionLocal
        from models.subscription import TelegramSubscription
        from models.apartment import Apartment as ApartmentModel
        from models.price_history import PriceHistory
        from sqlalchemy import select

        token = settings.TELEGRAM_BOT_TOKEN
        if not token:
            return {"skipped": True, "reason": "TELEGRAM_BOT_TOKEN not set"}

        async with AsyncSessionLocal() as db:
            subs_result = await db.execute(
                select(TelegramSubscription).where(
                    TelegramSubscription.is_active.is_(True)
                )
            )
            subs = subs_result.scalars().all()
            if not subs:
                return {"notified": 0}

            notified = 0
            for sub in subs:
                try:
                    filters = _json.loads(sub.filters_json or "{}")
                    from datetime import timedelta
                    cutoff = sub.last_notified_at or (datetime.now(timezone.utc) - timedelta(hours=6))

                    # --- Новые объявления ---
                    q = select(ApartmentModel).where(ApartmentModel.parsed_at > cutoff)
                    if filters.get("rooms") is not None:
                        q = q.where(ApartmentModel.rooms == filters["rooms"])
                    if filters.get("min_price"):
                        q = q.where(ApartmentModel.price >= filters["min_price"])
                    if filters.get("max_price"):
                        q = q.where(ApartmentModel.price <= filters["max_price"])
                    if filters.get("min_area"):
                        q = q.where(ApartmentModel.total_area >= filters["min_area"])
                    if filters.get("max_area"):
                        q = q.where(ApartmentModel.total_area <= filters["max_area"])
                    q = q.order_by(ApartmentModel.parsed_at.desc()).limit(5)
                    new_apts = (await db.execute(q)).scalars().all()

                    # --- Снижения цен (>=5%) по фильтрам подписки ---
                    drop_q = (
                        select(
                            ApartmentModel.id,
                            ApartmentModel.title,
                            ApartmentModel.price,
                            ApartmentModel.rooms,
                            ApartmentModel.link,
                            PriceHistory.change_pct,
                        )
                        .join(PriceHistory, PriceHistory.apartment_id == ApartmentModel.id)
                        .where(
                            PriceHistory.recorded_at > cutoff,
                            PriceHistory.change_pct <= -5,
                        )
                    )
                    if filters.get("rooms") is not None:
                        drop_q = drop_q.where(ApartmentModel.rooms == filters["rooms"])
                    if filters.get("max_price"):
                        drop_q = drop_q.where(ApartmentModel.price <= filters["max_price"])
                    drop_q = drop_q.order_by(PriceHistory.change_pct.asc()).limit(3)
                    price_drops = (await db.execute(drop_q)).all()

                    if not new_apts and not price_drops:
                        continue

                    # --- Одно объединённое сообщение ---
                    lines: list[str] = []

                    if new_apts:
                        lines.append(f"\U0001f3e0 <b>{len(new_apts)} новых объявлений</b> по вашему запросу:\n")
                        for apt in new_apts:
                            price_str = f"{apt.price:,}".replace(",", " ")
                            rooms_str = f"{apt.rooms}-комн." if apt.rooms else ""
                            area_str = f" · {apt.total_area} м²" if apt.total_area else ""
                            addr_str = f"\n   \U0001f4cd {(apt.address or '')[:60]}" if apt.address else ""
                            lines.append(f"• {rooms_str}{area_str} — <b>{price_str} KGS</b>{addr_str}")
                            lines.append(f"   <a href='{apt.link}'>Открыть объявление</a>")

                    if price_drops:
                        if lines:
                            lines.append("")
                        lines.append("\U0001f4c9 <b>Снижение цен:</b>")
                        for drop in price_drops:
                            price_str = f"{drop.price:,}".replace(",", " ")
                            rooms_str = f"{drop.rooms}-комн. · " if drop.rooms else ""
                            lines.append(
                                f"• {rooms_str}<b>{price_str} KGS</b> ({drop.change_pct:+.1f}%)"
                            )
                            lines.append(f"   <a href='{drop.link}'>{drop.title[:60]}</a>")

                    label = sub.filter_label or "все квартиры"
                    lines.append(f"\n\U0001f50d {label}")
                    lines.append("<i>/stop — отписаться · /status — мои подписки</i>")

                    url = f"https://api.telegram.org/bot{token}/sendMessage"
                    async with httpx.AsyncClient(timeout=10) as client:
                        resp = await client.post(url, json={
                            "chat_id": sub.chat_id,
                            "text": "\n".join(lines),
                            "parse_mode": "HTML",
                            "disable_web_page_preview": True,
                        })
                    if resp.status_code == 200:
                        sub.last_notified_at = datetime.now(timezone.utc)
                        notified += 1
                    elif resp.status_code == 403:
                        sub.is_active = False
                        logger.info(f"tg sub {sub.id}: user blocked the bot")

                except Exception as exc:
                    logger.error(f"tg notify sub={sub.id}: {exc}")

            await db.commit()
            return {"notified": notified, "total_subs": len(subs)}

    try:
        result = asyncio.run(_run())
        logger.info(f"Telegram notifications: {result}")
        return result
    except Exception as exc:
        logger.error(f"notify_telegram_subscribers: {exc}")
        raise self.retry(exc=exc, countdown=60 * 5)


@celery.task(name="tasks.retrain_model", bind=True, max_retries=2)
def retrain_model(self):
    """Регулярное переобучение ML-модели на актуальных данных из БД."""
    start_time = datetime.now()
    logger.info("Запущена задача автопереобучения модели")

    async def _run() -> dict:
        from config.database import AsyncSessionLocal
        from ml.trainer import PricePredictorTrainer

        trainer = PricePredictorTrainer()
        async with AsyncSessionLocal() as session:
            return await trainer.train(session)

    try:
        result = asyncio.run(_run())
    except Exception as e:
        logger.error(f"Ошибка в задаче переобучения: {e}")
        raise self.retry(exc=e, countdown=60 * 10)

    duration = (datetime.now() - start_time).total_seconds()

    if result.get("status") != "success":
        logger.warning(
            f"Переобучение не удалось: {result.get('message')} "
            f"(samples={result.get('samples')})"
        )
        return {
            "status": "skipped",
            "reason": result.get("message"),
            "samples": result.get("samples"),
            "dropped_samples": result.get("dropped_samples"),
            "duration_seconds": round(duration, 1),
            "timestamp": datetime.now().isoformat(),
        }

    logger.success(
        f"Модель переобучена за {duration:.1f} сек. "
        f"samples={result['samples']} MAE={result['mae']:,.0f} R²={result['r2']:.3f}"
    )
    return {
        "status": "success",
        "samples": result["samples"],
        "mae": result["mae"],
        "r2": result["r2"],
        "duration_seconds": round(duration, 1),
        "timestamp": datetime.now().isoformat(),
    }


@celery.task(name="tasks.geocode_apartments", bind=True, max_retries=2)
def geocode_apartments(self):
    """Geocodes up to 30 apartments per run that have an address but no coordinates."""

    async def _run() -> dict:
        from sqlalchemy import select, update
        from config.database import AsyncSessionLocal
        from models.apartment import Apartment as ApartmentModel
        from services.geocoding_service import geocoding_service

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(ApartmentModel.id, ApartmentModel.address)
                .where(ApartmentModel.address.isnot(None))
                .where(ApartmentModel.lat.is_(None))
                .order_by(ApartmentModel.parsed_at.desc())
                .limit(30)
            )
            batch = [(r.id, r.address) for r in result.all()]

            if not batch:
                return {"geocoded": 0}

            coords = await geocoding_service.geocode_batch(batch)
            if coords:
                for apt_id, lat, lng in coords:
                    await db.execute(
                        update(ApartmentModel)
                        .where(ApartmentModel.id == apt_id)
                        .values(lat=lat, lng=lng)
                    )
                await db.commit()

            logger.info(f"Geocoded {len(coords)}/{len(batch)} apartments")
            return {"attempted": len(batch), "geocoded": len(coords)}

    try:
        result = asyncio.run(_run())
        return result
    except Exception as exc:
        logger.error(f"geocode_apartments: {exc}")
        raise self.retry(exc=exc, countdown=60 * 5)


@celery.task(name="tasks.backup_database", bind=True, max_retries=1)
def backup_database(self):
    """Создаёт pg_dump и сохраняет в data/backups/, хранит последние 7."""
    backup_dir = settings.DATA_DIR / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_file = backup_dir / f"kyrgpulse_{timestamp}.sql.gz"

    env = {
        "PGPASSWORD": settings.POSTGRES_PASSWORD,
    }
    cmd = [
        "pg_dump",
        "-h", settings.POSTGRES_HOST,
        "-p", settings.POSTGRES_PORT,
        "-U", settings.POSTGRES_USER,
        "-d", settings.POSTGRES_DB,
        "--no-password",
    ]
    try:
        import os
        import gzip
        full_env = {**os.environ, **env}
        result = subprocess.run(cmd, capture_output=True, timeout=300, env=full_env)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.decode()[:500])
        with gzip.open(out_file, "wb") as f:
            f.write(result.stdout)
        size_mb = round(out_file.stat().st_size / 1024 / 1024, 2)
        logger.success(f"Backup created: {out_file.name} ({size_mb} MB)")

        # Keep only the 7 newest backups
        backups = sorted(backup_dir.glob("kyrgpulse_*.sql.gz"), key=lambda f: f.stat().st_mtime)
        for old in backups[:-7]:
            old.unlink()
            logger.info(f"Removed old backup: {old.name}")

        return {"status": "ok", "file": out_file.name, "size_mb": size_mb}
    except Exception as exc:
        logger.error(f"backup_database: {exc}")
        asyncio.run(_send_telegram_alert(f"Ошибка бэкапа БД:\n<code>{exc}</code>"))
        raise self.retry(exc=exc, countdown=60 * 10)


# Расписание:
#   - парсинг каждые 6 часов
#   - переобучение модели каждый день в 03:00 (Asia/Bishkek)
#   - уведомления Telegram каждые 30 минут
#   - геокодирование каждый час
#   - бэкап БД каждый день в 02:00
celery.conf.beat_schedule = {
    "parse-lalafo-every-6-hours": {
        "task": "tasks.parse_and_process",
        "schedule": crontab(minute=0, hour="*/6"),
        "options": {"queue": "beat"},
    },
    "retrain-model-daily": {
        "task": "tasks.retrain_model",
        "schedule": crontab(minute=0, hour=3),
        "options": {"queue": "beat"},
    },
    "notify-telegram-hourly": {
        "task": "tasks.notify_telegram_subscribers",
        "schedule": crontab(minute=30),
        "options": {"queue": "beat"},
    },
    "geocode-apartments-hourly": {
        "task": "tasks.geocode_apartments",
        "schedule": crontab(minute=15),
        "options": {"queue": "beat"},
    },
    "backup-database-daily": {
        "task": "tasks.backup_database",
        "schedule": crontab(minute=0, hour=2),
        "options": {"queue": "beat"},
    },
}

logger.success("Celery Beat + Worker configured for KyrgPulse")
