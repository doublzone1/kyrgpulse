import json
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import settings
from dependencies.db import get_db
from models.subscription import TelegramSubscription

router = APIRouter(prefix="/telegram", tags=["telegram"])

def _tma_url() -> str:
    return settings.TMA_URL

_BOT_COMMANDS = {
    "/start": (
        "\U0001f3e0 <b>KyrgPulse — аренда квартир в Бишкеке</b>\n\n"
        "Я буду присылать новые объявления и снижения цен по вашим фильтрам.\n\n"
        "/search — открыть поиск\n"
        "/status — ваши подписки\n"
        "/stop — отписаться от уведомлений"
    ),
    "/stop": "✅ Уведомления отключены. /start — чтобы снова подписаться.",
    "/status": None,  # handled dynamically
}


async def _send(chat_id: int, text: str, **extra: Any) -> None:
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return
    async with httpx.AsyncClient(timeout=8) as client:
        await client.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": text, "parse_mode": "HTML", **extra},
        )


@router.post("/webhook")
async def telegram_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Receives Telegram Bot API updates (set via setWebhook)."""
    try:
        update: dict = await request.json()
    except Exception:
        return {"ok": True}

    msg = update.get("message") or update.get("edited_message")
    if not msg:
        return {"ok": True}

    chat_id: int = msg["chat"]["id"]
    text: str = (msg.get("text") or "").strip()
    username: str | None = msg.get("from", {}).get("username")
    command = text.split()[0].split("@")[0] if text.startswith("/") else ""

    if command == "/start":
        # Send welcome + Mini App button
        await _send(
            chat_id,
            _BOT_COMMANDS["/start"],
            reply_markup=json.dumps({
                "inline_keyboard": [[
                    {
                        "text": "\U0001f50d Найти квартиру",
                        "web_app": {"url": _tma_url()},
                    }
                ]]
            }),
        )

    elif command == "/search":
        await _send(
            chat_id,
            "\U0001f50d Нажмите кнопку ниже, чтобы открыть поиск:",
            reply_markup=json.dumps({
                "inline_keyboard": [[
                    {
                        "text": "\U0001f3e0 Открыть поиск",
                        "web_app": {"url": _tma_url()},
                    }
                ]]
            }),
        )

    elif command == "/stop":
        result = await db.execute(
            select(TelegramSubscription).where(TelegramSubscription.chat_id == chat_id)
        )
        sub = result.scalar_one_or_none()
        if sub:
            sub.is_active = False
            await db.commit()
        await _send(chat_id, _BOT_COMMANDS["/stop"])

    elif command == "/status":
        result = await db.execute(
            select(TelegramSubscription).where(
                TelegramSubscription.chat_id == chat_id,
                TelegramSubscription.is_active == True,  # noqa: E712
            )
        )
        sub = result.scalar_one_or_none()
        if sub:
            label = sub.filter_label or "все квартиры"
            created = sub.created_at.strftime("%d.%m.%Y") if sub.created_at else "—"
            await _send(
                chat_id,
                f"\U00002705 Активная подписка: <b>{label}</b>\nС {created}\n\n/stop — отключить",
            )
        else:
            await _send(chat_id, "У вас нет активных подписок. /start — подписаться.")

    else:
        # Register/ensure subscriber exists if they wrote anything
        result = await db.execute(
            select(TelegramSubscription).where(TelegramSubscription.chat_id == chat_id)
        )
        sub = result.scalar_one_or_none()
        if not sub:
            db.add(TelegramSubscription(
                chat_id=chat_id,
                username=username,
                filters_json="{}",
                is_active=True,
            ))
            await db.commit()
            await _send(
                chat_id,
                "\U0001f44b Добро пожаловать в KyrgPulse!\n/start — начать работу",
            )

    return {"ok": True}


@router.post("/set-webhook")
async def set_webhook(request: Request):
    """Registers this server's webhook URL with Telegram Bot API."""
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        raise HTTPException(status_code=400, detail="TELEGRAM_BOT_TOKEN not configured")

    body = await request.json()
    webhook_url: str = body.get("url", "")
    if not webhook_url:
        raise HTTPException(status_code=422, detail="url field required")

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            f"https://api.telegram.org/bot{token}/setWebhook",
            json={"url": webhook_url, "allowed_updates": ["message"]},
        )
    return resp.json()


class SubscribeRequest(BaseModel):
    chat_id: int
    username: str | None = None
    filters: dict = {}
    filter_label: str | None = None


@router.post("/subscribe")
async def subscribe(payload: SubscribeRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TelegramSubscription).where(TelegramSubscription.chat_id == payload.chat_id)
    )
    sub = result.scalar_one_or_none()
    if sub:
        sub.is_active = True
        sub.filters_json = json.dumps(payload.filters, ensure_ascii=False)
        sub.filter_label = payload.filter_label
        sub.username = payload.username
    else:
        sub = TelegramSubscription(
            chat_id=payload.chat_id,
            username=payload.username,
            filters_json=json.dumps(payload.filters, ensure_ascii=False),
            filter_label=payload.filter_label,
            is_active=True,
        )
        db.add(sub)
    await db.commit()
    return {"status": "subscribed", "chat_id": payload.chat_id}


@router.delete("/unsubscribe/{chat_id}")
async def unsubscribe(chat_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TelegramSubscription).where(TelegramSubscription.chat_id == chat_id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Подписка не найдена")
    sub.is_active = False
    await db.commit()
    return {"status": "unsubscribed", "chat_id": chat_id}


@router.get("/subscriptions")
async def list_subscriptions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TelegramSubscription).where(TelegramSubscription.is_active == True)  # noqa: E712
    )
    subs = result.scalars().all()
    return {
        "count": len(subs),
        "subscriptions": [
            {
                "chat_id": s.chat_id,
                "username": s.username,
                "filter_label": s.filter_label,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in subs
        ],
    }
