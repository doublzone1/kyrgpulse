import json
from datetime import datetime
from typing import Dict

import httpx
from loguru import logger
from redis.asyncio import Redis

from config.settings import settings


class CurrencyService:
    def __init__(self):
        self.redis = Redis.from_url(settings.CELERY_BROKER_URL, decode_responses=True)
        self.base_currency = "KGS"
        self.target_currencies = ["USD", "EUR", "RUB"]
        self.cache_ttl = 3600
        self.last_source = "unknown"
        self.last_updated_at = None
        self.last_warning = None

    async def get_rates(self) -> Dict[str, float]:
        cache_key = f"currency_rates:{self.base_currency}"

        try:
            cached = await self.redis.get(cache_key)
            if cached:
                payload = json.loads(cached)
                if "rates" in payload:
                    self.last_source = payload.get("source", "cache")
                    self.last_updated_at = payload.get("updated_at")
                    self.last_warning = payload.get("warning")
                    logger.info("Курсы валют взяты из Redis-кэша")
                    return payload["rates"]

                self.last_source = "cache"
                self.last_updated_at = None
                self.last_warning = None
                logger.info("Курсы валют взяты из Redis-кэша")
                return payload
        except Exception:
            pass

        url = f"https://api.exchangerate.host/latest?base={self.base_currency}"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url)
                response.raise_for_status()
                data = response.json()
                api_rates = data.get("rates")

                if not isinstance(api_rates, dict):
                    raise ValueError("currency API response does not contain rates")

                rates = {
                    currency: api_rates.get(currency, 0.0)
                    for currency in self.target_currencies
                }
                payload = {
                    "rates": rates,
                    "source": "api.exchangerate.host",
                    "updated_at": datetime.now().isoformat(),
                    "warning": None,
                }

                try:
                    await self.redis.set(cache_key, json.dumps(payload), ex=self.cache_ttl)
                except Exception:
                    pass

                self.last_source = payload["source"]
                self.last_updated_at = payload["updated_at"]
                self.last_warning = None
                logger.success(f"Курсы валют обновлены: {rates}")
                return rates
        except Exception as e:
            logger.warning(f"Не удалось получить курсы валют, используем запасные значения: {e}")
            self.last_source = "fallback"
            self.last_updated_at = datetime.now().isoformat()
            self.last_warning = "Курс валют недоступен, используются резервные значения."
            return {"USD": 0.0118, "EUR": 0.0109, "RUB": 1.05}

    def get_rates_meta(self) -> Dict[str, str | None]:
        return {
            "source": self.last_source,
            "updated_at": self.last_updated_at,
            "warning": self.last_warning,
        }

    def convert_price(self, price_kgs: float, rates: Dict[str, float]) -> Dict:
        return {
            "KGS": round(price_kgs, 2),
            "USD": round(price_kgs * rates.get("USD", 0.0118), 2),
            "EUR": round(price_kgs * rates.get("EUR", 0.0109), 2),
            "RUB": round(price_kgs * rates.get("RUB", 1.05), 2),
        }


currency_service = CurrencyService()
