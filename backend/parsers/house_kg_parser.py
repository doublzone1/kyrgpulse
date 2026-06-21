"""Парсер объявлений об аренде квартир с house.kg.

Использует curl_cffi (Chrome TLS fingerprint) — тот же подход, что и
lalafo_http.py. Данные сохраняются в data/raw/house_kg_raw_*.parquet.

Запуск вручную:
    docker exec -it kyrgpulse-backend python -m parsers.house_kg_parser
"""

import json
import random
import re
import time
from datetime import datetime
from typing import Optional
from urllib.parse import urljoin, urlparse

import pandas as pd
from bs4 import BeautifulSoup
from curl_cffi import requests as cffi_requests
from loguru import logger

from config.settings import settings

BASE_URL = "https://house.kg"
# Аренда квартир в Бишкеке, сортировка по дате
LISTING_URL_TEMPLATE = (
    "{base}/arenda/kvartiry/bishkek/?currency=kgs&order_by=date_desc&page={page}"
)

IMPERSONATE = "chrome120"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "ru-RU,ru;q=0.9,ky;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Referer": BASE_URL,
}

# Ценовые паттерны для KGS и USD
_PRICE_RE = re.compile(
    r"([\d\s]{3,})\s*(сом|kgs|usd|\$)",
    re.IGNORECASE,
)


def _create_session() -> cffi_requests.Session:
    session = cffi_requests.Session(impersonate=IMPERSONATE)
    session.headers.update(HEADERS)
    return session


def _is_blocked(html: str) -> bool:
    if not html or len(html) < 1000:
        return True
    markers = ("Just a moment", "Checking your browser", "cf-challenge")
    return any(m.lower() in html.lower() for m in markers)


def _parse_price(text: str) -> tuple[int, str]:
    m = _PRICE_RE.search(text)
    if not m:
        return 0, "KGS"
    amount = int(re.sub(r"\D", "", m.group(1)) or 0)
    cur_raw = m.group(2).lower()
    currency = "USD" if "$" in cur_raw or "usd" in cur_raw else "KGS"
    return amount, currency


def _extract_listings_from_html(html: str, source_url: str) -> list[dict]:
    """Извлекает объявления из HTML-страницы house.kg.

    house.kg — классический многостраничный сайт на Rails/PHP.
    Карточки обычно это `<div class="listing-item">` или `<article>`.
    Резервный путь: ищем все ссылки вида /.../<id>.
    """
    soup = BeautifulSoup(html, "html.parser")
    items: list[dict] = []
    seen: set[str] = set()

    # house.kg использует ссылки вида /ru/details/<id>/
    # или /arenda/kvartiry/bishkek/<id>/
    link_pattern = re.compile(r"/(details|arenda|prodazha)/[^/]+/\d+", re.IGNORECASE)

    # Сначала ищем явные блоки карточек (article / div с классами)
    candidates = (
        soup.find_all("article")
        or soup.find_all("div", class_=re.compile(r"listing|item|card|property", re.I))
        or []
    )

    for block in candidates:
        link_tag = block.find("a", href=link_pattern)
        if not link_tag:
            link_tag = block.find("a", href=re.compile(r"/\d+"))
        if not link_tag:
            continue

        href = link_tag.get("href", "")
        if href.startswith("/"):
            url = urljoin(BASE_URL, href.split("?")[0])
        elif href.startswith("http"):
            url = href.split("?")[0]
        else:
            continue

        if url in seen:
            continue
        seen.add(url)

        # Заголовок: ищем h1/h2/h3, иначе весь текст блока (первые 120 символов)
        title_tag = block.find(["h1", "h2", "h3", "h4"])
        title = (title_tag.get_text(" ", strip=True) if title_tag else "").strip()
        if not title:
            title = block.get_text(" ", strip=True)[:120].strip()
        if not title:
            continue

        block_text = block.get_text(" ", strip=True)
        price, currency = _parse_price(block_text)

        # Адрес: ищем теги с классами address/location/district
        addr_tag = block.find(
            class_=re.compile(r"address|location|district|street", re.I)
        )
        address = addr_tag.get_text(" ", strip=True) if addr_tag else ""

        items.append({
            "title": title[:300],
            "price": price,
            "currency": currency,
            "address": address[:200],
            "link": url,
            "params": block_text[:500],
            "description": "",
            "parsed_at": datetime.now().isoformat(),
            "source": "house.kg",
        })

    # Если ничего не нашли через блоки — fallback: просто все ссылки на объявления
    if not items:
        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"]
            # house.kg: ссылки вида /details/<city>/<id>/ или /<city>/arenda/.../
            if not re.search(r"/\d{4,}/", href):
                continue
            url = urljoin(BASE_URL, href.split("?")[0]) if href.startswith("/") else href
            parsed = urlparse(url)
            if "house.kg" not in parsed.netloc:
                continue
            if url in seen:
                continue
            seen.add(url)

            title = a_tag.get_text(" ", strip=True)[:200].strip()
            if not title or len(title) < 5:
                continue

            parent = a_tag.find_parent(["li", "div", "article"])
            block_text = parent.get_text(" ", strip=True) if parent else title
            price, currency = _parse_price(block_text)

            items.append({
                "title": title,
                "price": price,
                "currency": currency,
                "address": "",
                "link": url,
                "params": block_text[:500],
                "description": "",
                "parsed_at": datetime.now().isoformat(),
                "source": "house.kg",
            })

    return items


def _try_extract_json_ld(html: str) -> list[dict]:
    """Пробует достать structured data из JSON-LD (schema.org/Residence)."""
    soup = BeautifulSoup(html, "html.parser")
    items: list[dict] = []
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        if isinstance(data, list):
            entries = data
        else:
            entries = [data]
        for entry in entries:
            if entry.get("@type") not in (
                "Residence", "Apartment", "RealEstateListing", "Product"
            ):
                continue
            url = entry.get("url", "")
            name = entry.get("name", "")
            if not url or not name:
                continue
            offer = entry.get("offers") or {}
            if isinstance(offer, list):
                offer = offer[0] if offer else {}
            price = int(offer.get("price") or 0)
            currency = (offer.get("priceCurrency") or "KGS").upper()
            address_obj = entry.get("address") or {}
            address = (
                address_obj.get("streetAddress")
                or address_obj.get("addressLocality")
                or ""
            )
            items.append({
                "title": name[:300],
                "price": price,
                "currency": currency,
                "address": address[:200],
                "link": url,
                "params": "",
                "description": entry.get("description", "")[:500],
                "parsed_at": datetime.now().isoformat(),
                "source": "house.kg",
            })
    return items


def fetch_page(
    session: cffi_requests.Session, page_num: int
) -> list[dict]:
    url = LISTING_URL_TEMPLATE.format(base=BASE_URL, page=page_num)
    logger.info(f"📄 GET {url}")

    try:
        resp = session.get(url, timeout=30)
    except Exception as exc:
        logger.warning(f"house.kg: запрос упал: {exc}")
        return []

    if resp.status_code != 200:
        logger.warning(f"house.kg: HTTP {resp.status_code} на стр. {page_num}")
        return []

    html = resp.text
    if _is_blocked(html):
        logger.warning(f"house.kg: защита/пустой ответ на стр. {page_num}")
        return []

    # 1. JSON-LD (schema.org) — самый чистый
    jld = _try_extract_json_ld(html)
    if jld:
        logger.success(f"  ✓ JSON-LD: {len(jld)} объявлений")
        return jld

    # 2. HTML-парсинг
    html_items = _extract_listings_from_html(html, url)
    if html_items:
        logger.info(f"  ✓ HTML: {len(html_items)} объявлений")
    else:
        logger.warning(f"  ⚠ house.kg стр. {page_num}: ничего не извлечено")

    return html_items


def run() -> Optional[pd.DataFrame]:
    """Главная точка входа. Возвращает DataFrame или None."""
    session = _create_session()

    # Прогрев сессии
    try:
        warm = session.get(BASE_URL, timeout=30)
        logger.info(f"🔥 house.kg прогрев: HTTP {warm.status_code}")
    except Exception as exc:
        logger.warning(f"house.kg прогрев упал: {exc}")
    time.sleep(2)

    all_items: list[dict] = []
    consecutive_empty = 0
    max_pages = settings.MAX_PAGES

    for page_num in range(1, max_pages + 1):
        items = fetch_page(session, page_num)
        all_items.extend(items)

        if items:
            consecutive_empty = 0
        else:
            consecutive_empty += 1
            if consecutive_empty >= 3:
                logger.error("house.kg: 3 страницы подряд пусты — прерываем")
                break

        time.sleep(2 + random.random() * 2)

    # Дедупликация по ссылке
    unique = {item["link"]: item for item in all_items if item.get("link")}
    items_list = list(unique.values())

    if not items_list:
        logger.error("house.kg: ничего не собрано")
        return None

    df = pd.DataFrame(items_list)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    raw_path = settings.RAW_DATA / f"house_kg_raw_{timestamp}.parquet"
    df.to_parquet(raw_path, index=False)
    df.to_csv(settings.RAW_DATA / f"house_kg_raw_{timestamp}.csv", index=False)

    logger.success(f"✅ house.kg: собрано {len(df)} объявлений → {raw_path.name}")
    return df


if __name__ == "__main__":
    run()
