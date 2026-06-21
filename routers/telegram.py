"""Telegram Bot router: deep-link subscriptions + webhook updates."""

import json
import secrets
from datetime import datetime
from typing import Optional

import httpx
import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Request
from loguru import logger
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import settings
from dependencies.db import get_db
from models.subscription import TelegramSubscription

router = APIRouter(prefix="/api/telegram", tags=["Telegram Bot"])


def _redis():
    return aioredis.from_url(settings.CELERY_BROKER_URL, decode_responses=True)


async def _send_message(chat_id: int, text: str) -> bool:
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return False
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json={
                "chat_id": chat_id,
                "text": text,
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            })
            return resp.status_code == 200
    except Exception as exc:
        logger.warning(f"Telegram sendMessage failed: {exc}")
        return False


def _filters_label(filters: dict) -> str:
    parts: list[str] = []
    rooms = filters.get("rooms")
    if rooms is not None:
        parts.append("Студия" if rooms == 0 else f"{rooms} комн.")
    min_p, max_p = filters.get("min_price"), filters.get("max_price")
    if min_p and max_p:
        parts.append(f"{int(min_p):,}–{int(max_p):,} KGS".replace(",", " "))
    elif max_p:
        parts.append(f"до {int(max_p):,} KGS".replace(",", " "))
    elif min_p:
        parts.append(f"от {int(min_p):,} KGS".replace(",", " "))
    zone = filters.get("zone")
    if zone:
        parts.append(f"зона: {zone}")
    return ", ".join(parts) if parts else "все квартиры"


# ── POST /api/telegram/link ──────────────────────────────────────────────────

class FilterLinkRequest(BaseModel):
    filters: dict
    label: Optional[str] = None


@router.post("/link")
async def generate_subscribe_link(body: FilterLinkRequest):
    """Генерирует one-time deep link для подписки через бота (TTL 15 мин)."""
    if not settings.TELEGRAM_BOT_TOKEN or not settings.TELEGRAM_BOT_USERNAME:
        raise HTTPException(
            status_code=503,
            detail="Telegram бот не настроен. Укажите TELEGRAM_BOT_TOKEN и TELEGRAM_BOT_USERNAME в .env",
        )

    token = secrets.token_urlsafe(12)
    payload = json.dumps(
        {"filters": body.filters, "label": body.label or _filters_label(body.filters)},
        ensure_ascii=False,
    )

    redis = _redis()
    try:
        await redis.setex(f"tg:link:{token}", 900, payload)
    finally:
        await redis.aclose()

    url = f"https://t.me/{settings.TELEGRAM_BOT_USERNAME}?start=sub_{token}"
    return {"url": url, "expires_in": 900}


# ── POST /api/telegram/webhook ───────────────────────────────────────────────

@router.post("/webhook")
async def telegram_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    try:
        data = await request.json()
    except Exception:
        return {"ok": True}

    message = data.get("message") or data.get("edited_message") or {}
    chat = message.get("chat", {})
    chat_id = chat.get("id")
    from_user = message.get("from", {})
    username = from_user.get("username", "")
    text = (message.get("text") or "").strip()

    if not chat_id:
        return {"ok": True}

    if text.startswith("/start"):
        payload_str = text[6:].strip()

        if payload_str.startswith("sub_"):
            link_token = payload_str[4:]
            redis = _redis()
            try:
                raw = await redis.get(f"tg:link:{link_token}")
                if not raw:
                    await _send_message(
                        chat_id,
                        "⚠️ Ссылка устарела (действует 15 минут). Вернитесь на KyrgPulse и создайте новую подписку.",
                    )
                    return {"ok": True}
                obj = json.loads(raw)
                await redis.delete(f"tg:link:{link_token}")
            finally:
                await redis.aclose()

            filters_json = json.dumps(obj.get("filters", {}), ensure_ascii=False)
            label = obj.get("label") or _filters_label(obj.get("filters", {}))

            sub = TelegramSubscription(
                chat_id=chat_id,
                username=username,
                filters_json=filters_json,
                filter_label=label,
                last_notified_at=datetime.now(),
            )
            db.add(sub)
            await db.commit()

            await _send_message(
                chat_id,
                f"✅ <b>Подписка оформлена!</b>\n\n"
                f"🔍 Критерии: {label}\n\n"
                f"Как только появятся новые объявления по вашему запросу — сразу напишу.\n\n"
                f"<i>/stop — отписаться · /status — мои подписки</i>",
            )
        else:
            await _send_message(
                chat_id,
                "👋 Привет! Я уведомляю о новых квартирах на lalafo.kg.\n\n"
                "Перейдите на <b>KyrgPulse</b>, настройте фильтры и нажмите «Подписаться в Telegram».",
            )

    elif text == "/stop":
        result = await db.execute(
            select(TelegramSubscription).where(
                TelegramSubscription.chat_id == chat_id,
                TelegramSubscription.is_active.is_(True),
            )
        )
        subs = result.scalars().all()
        for sub in subs:
            sub.is_active = False
        await db.commit()

        if subs:
            await _send_message(
                chat_id,
                f"🔕 Отписано от {len(subs)} подписки(ок). Возвращайтесь на KyrgPulse!",
            )
        else:
            await _send_message(chat_id, "У вас нет активных подписок.")

    elif text == "/status":
        result = await db.execute(
            select(TelegramSubscription).where(
                TelegramSubscription.chat_id == chat_id,
                TelegramSubscription.is_active.is_(True),
            )
        )
        subs = result.scalars().all()
        if not subs:
            await _send_message(chat_id, "У вас нет активных подписок.")
        else:
            lines = [f"📋 Активные подписки ({len(subs)}):"]
            for i, sub in enumerate(subs, 1):
                lines.append(f"{i}. {sub.filter_label or 'все квартиры'}")
            lines.append("\n/stop — отписаться от всех")
            await _send_message(chat_id, "\n".join(lines))

    return {"ok": True}
