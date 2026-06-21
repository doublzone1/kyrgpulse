"""API key management — admin-protected endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import settings
from dependencies.db import get_db
from models.api_key import ApiKey

router = APIRouter(prefix="/admin/api-keys", tags=["api-keys"])


def _require_admin(x_admin_token: str = Header(...)):
    if not settings.ADMIN_PASSWORD or x_admin_token != settings.ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Admin access required")


@router.get("")
async def list_keys(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_admin),
):
    result = await db.execute(select(ApiKey).order_by(ApiKey.created_at.desc()))
    keys = result.scalars().all()
    return {
        "keys": [
            {
                "id": k.id,
                "key": k.key[:8] + "…",  # mask most of the key
                "label": k.label,
                "is_active": k.is_active,
                "created_at": k.created_at.isoformat() if k.created_at else None,
                "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
                "requests_count": k.requests_count,
            }
            for k in keys
        ]
    }


@router.post("")
async def create_key(
    label: str = "",
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_admin),
):
    key_value = ApiKey.generate()
    new_key = ApiKey(key=key_value, label=label or None)
    db.add(new_key)
    await db.commit()
    await db.refresh(new_key)
    return {"id": new_key.id, "key": key_value, "label": new_key.label}


@router.delete("/{key_id}")
async def revoke_key(
    key_id: int,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(_require_admin),
):
    result = await db.execute(select(ApiKey).where(ApiKey.id == key_id))
    k = result.scalar_one_or_none()
    if not k:
        raise HTTPException(status_code=404, detail="API key not found")
    await db.execute(update(ApiKey).where(ApiKey.id == key_id).values(is_active=False))
    await db.commit()
    return {"revoked": True}


async def get_api_key_optional(
    x_api_key: str = Header(default=""),
    db: AsyncSession = Depends(get_db),
) -> ApiKey | None:
    """Dependency: validates X-Api-Key header if provided. Returns ApiKey or None."""
    if not x_api_key:
        return None
    result = await db.execute(
        select(ApiKey).where(ApiKey.key == x_api_key, ApiKey.is_active == True)  # noqa: E712
    )
    key_obj = result.scalar_one_or_none()
    if key_obj:
        await db.execute(
            update(ApiKey)
            .where(ApiKey.id == key_obj.id)
            .values(last_used_at=datetime.now(), requests_count=ApiKey.requests_count + 1)
        )
        await db.commit()
    return key_obj


async def require_api_key(
    x_api_key: str = Header(..., description="API key — obtain from /admin/api-keys"),
    db: AsyncSession = Depends(get_db),
) -> ApiKey:
    """Dependency: requires a valid X-Api-Key header."""
    result = await db.execute(
        select(ApiKey).where(ApiKey.key == x_api_key, ApiKey.is_active == True)  # noqa: E712
    )
    key_obj = result.scalar_one_or_none()
    if not key_obj:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    await db.execute(
        update(ApiKey)
        .where(ApiKey.id == key_obj.id)
        .values(last_used_at=datetime.now(), requests_count=ApiKey.requests_count + 1)
    )
    await db.commit()
    return key_obj
