"""Geocoding service using Nominatim (OpenStreetMap).

Rate limit: 1 request/second per Nominatim ToS.
In-memory cache prevents re-geocoding the same address.
Only geocodes addresses that look specific (contain digits or street keywords).
"""

import asyncio
import re
from typing import Optional

import httpx
from loguru import logger

_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
_USER_AGENT = "KyrgPulse/1.0 rental-aggregator bishkek"

# Looks specific enough to geocode (has a number OR street keyword)
_SPECIFIC_RE = re.compile(
    r"\d|ул\.|пр\.|б-р|бульвар|переулок|пер\.|проспект|микрорайон|мкр",
    re.IGNORECASE,
)

# Vague zone-level labels that won't geocode well
_VAGUE_PHRASES = {
    "центр", "center", "южная", "северная", "восточная", "западная",
    "мкр", "микрорайоны",
}


class GeocodingService:
    def __init__(self) -> None:
        self._cache: dict[str, tuple[float, float]] = {}

    def _is_specific(self, address: str) -> bool:
        if not address or len(address.strip()) < 8:
            return False
        lower = address.lower().strip()
        if lower in _VAGUE_PHRASES:
            return False
        return bool(_SPECIFIC_RE.search(lower))

    async def geocode(self, address: str) -> Optional[tuple[float, float]]:
        if not self._is_specific(address):
            return None

        key = address.lower().strip()
        if key in self._cache:
            return self._cache[key]

        query = f"{address.strip()}, Бишкек, Кыргызстан"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    _NOMINATIM_URL,
                    params={
                        "q": query,
                        "format": "json",
                        "limit": 1,
                        "countrycodes": "kg",
                        "viewbox": "74.4,42.75,74.75,42.98",
                        "bounded": 1,
                    },
                    headers={"User-Agent": _USER_AGENT},
                )
                data = resp.json()
                if data:
                    lat = float(data[0]["lat"])
                    lon = float(data[0]["lon"])
                    self._cache[key] = (lat, lon)
                    return lat, lon
        except Exception as exc:
            logger.debug(f"Geocoding '{address[:60]}': {exc}")

        self._cache[key] = None  # type: ignore[assignment]
        return None

    async def geocode_batch(
        self,
        addresses: list[tuple[int, str]],  # [(apartment_id, address), ...]
        delay: float = 1.1,
    ) -> list[tuple[int, float, float]]:
        """Geocode a batch with rate-limiting. Returns [(id, lat, lng), ...]."""
        results: list[tuple[int, float, float]] = []
        for apt_id, address in addresses:
            coords = await self.geocode(address)
            if coords:
                results.append((apt_id, coords[0], coords[1]))
            await asyncio.sleep(delay)
        return results


geocoding_service = GeocodingService()
