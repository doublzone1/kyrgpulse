"""Альтернативный HTTP-парсер lalafo.kg через curl_cffi.

Зачем нужен: Playwright + headless Chrome детектится Cloudflare
по JavaScript-fingerprint. curl_cffi умеет имитировать TLS-fingerprint
настоящего Chrome (uTLS / impersonate=chrome131), и для большинства
Cloudflare-настроек этого хватает.

Запуск:
    docker exec -it kyrgpulse-backend python -m parsers.lalafo_http
"""

import json
import random
import re
import time
from datetime import datetime
from typing import Optional
from urllib.parse import urljoin

import pandas as pd
from bs4 import BeautifulSoup
from curl_cffi import requests as cffi_requests
from loguru import logger
from tqdm import tqdm

from config.settings import settings


BASE_URL = "https://lalafo.kg"
LISTING_URL_TEMPLATE = (
    "{base}/{city}/kvartiry/arenda-kvartir/dolgosrochnaya-arenda-kvartir?page={page}"
)

IMPERSONATE = "chrome120"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)
HEADERS = {
    "User-Agent": USER_AGENT,
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Ch-Ua": (
        '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"'
    ),
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
}


def _create_session() -> cffi_requests.Session:
    session = cffi_requests.Session(impersonate=IMPERSONATE)
    session.headers.update(HEADERS)
    return session


def _looks_like_cloudflare(html: str) -> bool:
    if not html:
        return True
    if len(html) < 1500:
        return True
    markers = (
        "Just a moment",
        "Checking your browser",
        "cf-browser-verification",
        "cf-challenge-platform",
        "Please verify you are human",
    )
    return any(m.lower() in html.lower() for m in markers)


def _try_extract_next_data(html: str) -> Optional[list[dict]]:
    """Пытается достать listing items из __NEXT_DATA__ (Next.js SSR JSON).

    Lalafo построен на Next.js — на странице есть тег:
        <script id="__NEXT_DATA__" type="application/json">{...}</script>
    Из него можно достать структурированные объявления без regex.
    """
    soup = BeautifulSoup(html, "html.parser")
    tag = soup.find("script", id="__NEXT_DATA__")
    if not tag or not tag.string:
        return None
    try:
        data = json.loads(tag.string)
    except json.JSONDecodeError:
        return None

    # Структура lalafo меняется, поэтому ищем listing рекурсивно
    items: list[dict] = []

    def walk(node):
        if isinstance(node, dict):
            # Эвристика: items ad'ов имеют title + price + url/mobile_url
            if (
                "title" in node
                and ("price" in node or "currency" in node)
                and ("url" in node or "mobile_url" in node)
            ):
                items.append(node)
                return
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(data)
    return items if items else None


def _extract_from_html(html: str) -> list[dict]:
    """Резервный путь — выдираем карточки прямо из HTML, если NEXT_DATA пустой."""
    soup = BeautifulSoup(html, "html.parser")
    items: list[dict] = []
    seen: set[str] = set()

    for link in soup.select('a[href*="/ad/"]'):
        href = link.get("href") or ""
        if not href.startswith("/"):
            continue
        url = urljoin(BASE_URL, href.split("?")[0])
        if url in seen:
            continue
        seen.add(url)

        title_el = link.find(["h2", "h3"]) or link
        title = (title_el.get_text(" ", strip=True) or "").strip()
        if not title or len(title) < 5:
            continue

        block = link.find_parent("article") or link.find_parent("li") or link.parent
        block_text = block.get_text(" ", strip=True) if block else title

        price = 0
        currency = "KGS"
        price_match = re.search(
            r"(\d[\d\s.,]{2,})\s*(сом|kgs|usd|\$|eur|€|rub|руб)",
            block_text,
            flags=re.IGNORECASE,
        )
        if price_match:
            price = int(re.sub(r"[^\d]", "", price_match.group(1)) or 0)
            cur = price_match.group(2).lower()
            if "$" in cur or "usd" in cur:
                currency = "USD"
            elif "€" in cur or "eur" in cur:
                currency = "EUR"
            elif "руб" in cur or "rub" in cur:
                currency = "RUB"

        items.append(
            {
                "title": title,
                "price": price,
                "currency": currency,
                "address": "",
                "link": url,
                "params": block_text[:500],
                "description": "",
                "parsed_at": datetime.now().isoformat(),
                "source": "lalafo",
            }
        )

    return items


def _normalize_next_item(node: dict) -> Optional[dict]:
    title = (node.get("title") or "").strip()
    if not title:
        return None
    url = node.get("url") or node.get("mobile_url") or ""
    if url.startswith("/"):
        url = urljoin(BASE_URL, url)
    if not url:
        return None

    raw_price = node.get("price") or 0
    try:
        price = int(raw_price) if raw_price else 0
    except (TypeError, ValueError):
        price = 0
    currency = (node.get("currency") or "KGS").upper()

    address = ""
    city = node.get("city") or ""
    district = node.get("district") or ""
    if district and city:
        address = f"{district}, {city}"
    elif city:
        address = city
    elif district:
        address = district

    description = (node.get("description") or "").strip()

    params_parts: list[str] = []
    for key in ("rooms", "total_area", "floor", "address", "category_name"):
        value = node.get(key)
        if value:
            params_parts.append(f"{key}: {value}")

    return {
        "title": title,
        "price": price,
        "currency": currency,
        "address": address,
        "link": url,
        "params": " | ".join(params_parts),
        "description": description,
        "parsed_at": datetime.now().isoformat(),
        "source": "lalafo",
    }


def fetch_page(session: cffi_requests.Session, page_num: int) -> list[dict]:
    url = LISTING_URL_TEMPLATE.format(
        base=BASE_URL, city=settings.CITY, page=page_num
    )
    logger.info(f"📄 GET {url}")

    try:
        response = session.get(url, timeout=30)
    except Exception as exc:
        logger.warning(f"запрос упал: {exc}")
        return []

    if response.status_code != 200:
        logger.warning(f"HTTP {response.status_code}")
        return []

    html = response.text
    if _looks_like_cloudflare(html):
        logger.warning(f"🛡 Cloudflare challenge на стр. {page_num}")
        return []

    next_items = _try_extract_next_data(html)
    if next_items:
        normalized = [
            x for x in (_normalize_next_item(item) for item in next_items) if x
        ]
        if normalized:
            logger.success(
                f"  ✓ из __NEXT_DATA__ извлечено {len(normalized)} объявлений"
            )
            return normalized

    fallback = _extract_from_html(html)
    if fallback:
        logger.info(f"  ⚠ fallback по HTML: {len(fallback)} объявлений")
    else:
        logger.warning(
            "  не нашли ни __NEXT_DATA__, ни ссылок /ad/* в HTML"
        )
    return fallback


def run() -> Optional[pd.DataFrame]:
    session = _create_session()
    # Прогреваем сессию: ходим сначала на главную чтобы получить Cloudflare-куки
    try:
        warm = session.get(BASE_URL, timeout=30)
        logger.info(f"🔥 прогрев главной: HTTP {warm.status_code}, {len(warm.text)} bytes")
    except Exception as exc:
        logger.warning(f"прогрев упал: {exc}")
    time.sleep(1.5)

    all_items: list[dict] = []
    consecutive_failures = 0

    for page_num in tqdm(
        range(1, settings.MAX_PAGES + 1), desc="lalafo через curl_cffi"
    ):
        items = fetch_page(session, page_num)
        all_items.extend(items)
        if items:
            consecutive_failures = 0
        else:
            consecutive_failures += 1
            if consecutive_failures >= 3:
                logger.error(
                    "🛑 3 страницы подряд без объявлений — прерываем."
                )
                break
        time.sleep(2 + random.random() * 2)

    # Дедуплицируем по link
    unique = {item["link"]: item for item in all_items if item.get("link")}
    items_list = list(unique.values())

    if not items_list:
        logger.error("❌ Ничего не собрано. Cloudflare всё ещё блокирует.")
        return None

    df = pd.DataFrame(items_list)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    raw_path = settings.RAW_DATA / f"lalafo_raw_{timestamp}.parquet"
    df.to_parquet(raw_path, index=False)
    df.to_csv(settings.RAW_DATA / f"lalafo_raw_{timestamp}.csv", index=False)

    logger.success(f"✅ Собрано {len(df)} объявлений (curl_cffi)")
    logger.success(f"📁 Файл: {raw_path}")
    return df


if __name__ == "__main__":
    run()
