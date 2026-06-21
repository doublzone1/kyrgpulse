import asyncio
import random
import re
from datetime import datetime
from urllib.parse import urljoin

import pandas as pd
from loguru import logger
from playwright.async_api import async_playwright
from tqdm import tqdm

from config.settings import settings


# Встроенный stealth init script — заменяет playwright-stealth, который
# тащит за собой pkg_resources и плохо работает на Python 3.12.
# Источник идей: puppeteer-extra-plugin-stealth, открытые гайды по обходу
# Cloudflare для headless Chromium.
STEALTH_INIT_SCRIPT = """
// 1. webdriver — главный сигнал автоматизации
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

// 2. Языки и плагины — у живого Chrome их несколько
Object.defineProperty(navigator, 'languages', {
  get: () => ['ru-RU', 'ru', 'en-US', 'en'],
});
Object.defineProperty(navigator, 'plugins', {
  get: () => [
    { name: 'Chrome PDF Plugin' },
    { name: 'Chrome PDF Viewer' },
    { name: 'Native Client' },
  ],
});

// 3. window.chrome — у headless его нет, у живого Chrome есть
window.chrome = {
  runtime: {},
  loadTimes: function () {},
  csi: function () {},
  app: {},
};

// 4. permissions API — Cloudflare иногда дёргает permissions.query
const originalQuery = window.navigator.permissions
  ? window.navigator.permissions.query
  : null;
if (originalQuery) {
  window.navigator.permissions.query = (parameters) =>
    parameters.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : originalQuery(parameters);
}

// 5. WebGL vendor — headless Chromium возвращает SwiftShader,
// настоящий Chrome — Intel/NVIDIA/AMD
const getParameter = WebGLRenderingContext.prototype.getParameter;
WebGLRenderingContext.prototype.getParameter = function (parameter) {
  if (parameter === 37445) return 'Intel Inc.';
  if (parameter === 37446) return 'Intel Iris OpenGL Engine';
  return getParameter.call(this, parameter);
};

// 6. hardwareConcurrency и deviceMemory — у headless часто 1 ядро
Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
"""


# Селекторы карточек на странице списка. Lalafo меняет классы — пробуем по очереди.
LISTING_CARD_SELECTORS = [
    'a[href*="/bishkek/ad/"]',
    'a[href*="/ad/"]',
    'div[data-testid="listing-item"]',
    'article[data-testid*="listing"]',
    'div[class*="ListingCard"]',
    'div[class*="listing-card"]',
    'div[class*="card"]',
]


class LalafoParser:
    def __init__(self):
        self.base_url = (
            f"https://lalafo.kg/{settings.CITY}/kvartiry/arenda-kvartir/"
            f"dolgosrochnaya-arenda-kvartir"
        )
        logger.info(f"🚀 Парсер lalafo.kg запущен для города: {settings.CITY}")

    async def _human_pause(self, base_ms: int = 1500) -> None:
        """Случайная пауза, чтобы выглядеть как пользователь."""
        await asyncio.sleep((base_ms + random.randint(0, 800)) / 1000)

    async def _wait_for_listing(self, page) -> bool:
        """Пробует все известные селекторы карточек. True если хоть один сработал."""
        for selector in LISTING_CARD_SELECTORS:
            try:
                await page.wait_for_selector(selector, timeout=8000)
                return True
            except Exception:
                continue
        return False

    async def _detect_cloudflare(self, page) -> bool:
        """True если страница застряла на Cloudflare challenge."""
        try:
            content = await page.content()
        except Exception:
            return False
        markers = [
            "Just a moment",
            "Checking your browser",
            "cf-browser-verification",
            "Cloudflare",
            "Please verify you are human",
        ]
        return any(marker.lower() in content.lower() for marker in markers)

    async def parse_page(self, page, page_num: int):
        url = f"{self.base_url}?page={page_num}"
        logger.info(f"📄 Открываем страницу {page_num}: {url}")

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=60000)
        except Exception as e:
            logger.warning(f"goto failed: {e}")
            return []

        # Если Cloudflare — даём ему время на challenge и обновляем
        if await self._detect_cloudflare(page):
            logger.warning(f"🛡 Cloudflare challenge на стр. {page_num}, ждём 12s")
            await self._human_pause(12000)
            try:
                await page.reload(wait_until="domcontentloaded", timeout=60000)
            except Exception:
                pass

        # Имитация поведения пользователя — медленный скролл вниз и наверх
        await page.evaluate("window.scrollTo({top: 400, behavior: 'smooth'})")
        await self._human_pause(800)
        await page.evaluate(
            "window.scrollTo({top: document.body.scrollHeight, behavior: 'smooth'})"
        )
        await self._human_pause(1200)
        await page.evaluate("window.scrollTo({top: 0, behavior: 'smooth'})")
        await self._human_pause(600)

        ok = await self._wait_for_listing(page)
        if not ok:
            if await self._detect_cloudflare(page):
                logger.warning(
                    f"⚠️ Cloudflare всё ещё не пропустил на странице {page_num}"
                )
            else:
                logger.warning(
                    f"⚠️ Карточки не найдены на странице {page_num} "
                    "(возможно, селекторы устарели — проверьте DevTools)"
                )
            return []

        # Берём первый сработавший селектор для query_selector_all
        cards = []
        for selector in LISTING_CARD_SELECTORS:
            cards = await page.query_selector_all(selector)
            if cards:
                logger.info(
                    f"Найдено {len(cards)} карточек по селектору `{selector}` "
                    f"на странице {page_num}"
                )
                break

        items = []
        for card in cards:
            try:
                title_el = await card.query_selector(
                    'h2, h3, [class*="title"], [class*="Title"]'
                )
                title = (
                    (await title_el.inner_text()).strip() if title_el else ""
                )
                if not title:
                    # карточка без заголовка часто оказывается рекламой/нерелевантной
                    continue

                price_el = await card.query_selector(
                    '[class*="price"], [data-testid*="price"], .price, '
                    '[class*="Price"]'
                )
                card_text = await card.inner_text()
                price_text = (
                    await price_el.inner_text() if price_el else ""
                )
                price, currency = self._parse_price(price_text)
                if price == 0:
                    price, currency = self._extract_price_from_text(card_text)

                address_el = await card.query_selector(
                    '[class*="location"], [class*="address"], '
                    '[data-testid*="location"], [class*="Location"]'
                )
                address = (
                    (await address_el.inner_text()).strip() if address_el else ""
                )

                href = ""
                # Карточка может сама быть <a> или содержать <a> внутри
                tag = await card.evaluate("(el) => el.tagName")
                if str(tag).lower() == "a":
                    href = await card.get_attribute("href") or ""
                if not href:
                    link_el = await card.query_selector(
                        f'a[href^="/{settings.CITY}"], a[href*="/{settings.CITY}/"], '
                        'a[href^="/"]'
                    )
                    href = (
                        await link_el.get_attribute("href") if link_el else ""
                    ) or ""
                link = urljoin("https://lalafo.kg", href) if href else ""

                if not link:
                    continue

                params_els = await card.query_selector_all(
                    'span, div[class*="param"], [class*="info"]'
                )
                params_text = []
                for p in params_els:
                    try:
                        text = (await p.inner_text()).strip()
                    except Exception:
                        continue
                    if text and text != title:
                        params_text.append(text)

                # Фото — пробуем несколько атрибутов (lazy-load часто в data-src)
                img_el = await card.query_selector(
                    'img[data-src], img[src*="lalafo"], img[class*="photo"], img[class*="image"], img'
                )
                image_url = ""
                if img_el:
                    image_url = (
                        await img_el.get_attribute("data-src")
                        or await img_el.get_attribute("src")
                        or ""
                    )
                    # Отфильтровываем data-URI, SVG-заглушки и пиксели слежки
                    if image_url.startswith("data:") or "placeholder" in image_url or len(image_url) < 10:
                        image_url = ""

                items.append({
                    "title": title,
                    "price": price,
                    "address": address,
                    "link": link,
                    "params": " | ".join(params_text),
                    "description": "",
                    "image_url": image_url,
                    "parsed_at": datetime.now().isoformat(),
                    "source": "lalafo",
                    "currency": currency,
                })
            except Exception as e:
                logger.debug(f"card parse fail: {e}")
                continue

        # Дедуплицируем по link (карточки могут дублироваться селекторами)
        unique = {item["link"]: item for item in items if item["link"]}
        return list(unique.values())

    # ------------------------------------------------------------------
    # Детальная страница объявления
    # ------------------------------------------------------------------
    async def _parse_detail(self, context, link: str) -> dict:
        result = {"description": "", "params_extra": "", "address": ""}
        if not link:
            return result

        page = await context.new_page()
        try:
            await page.goto(
                link, wait_until="domcontentloaded", timeout=settings.DETAIL_TIMEOUT_MS
            )
            try:
                await page.wait_for_selector(
                    'h1, [class*="Description"], [class*="description"]',
                    timeout=12000,
                )
            except Exception:
                pass

            desc = await self._first_text(
                page,
                [
                    '[data-testid*="description"]',
                    '[class*="AdDescription"]',
                    '[class*="ad-description"]',
                    '[class*="Description__text"]',
                    'section[class*="description"]',
                    'article p',
                ],
            )
            if desc:
                result["description"] = self._clean_whitespace(desc)

            params_extra = await self._extract_params_block(page)
            if params_extra:
                result["params_extra"] = params_extra

            addr = await self._first_text(
                page,
                [
                    '[data-testid*="location"]',
                    '[class*="LocationLink"]',
                    '[class*="Location__address"]',
                    '[class*="address"]',
                ],
            )
            if addr:
                result["address"] = self._clean_whitespace(addr)
        except Exception as e:
            logger.debug(f"detail fail {link}: {e}")
        finally:
            await page.close()

        return result

    async def _first_text(self, page, selectors: list[str]) -> str:
        for selector in selectors:
            try:
                element = await page.query_selector(selector)
                if not element:
                    continue
                text = (await element.inner_text()).strip()
                if text:
                    return text
            except Exception:
                continue
        return ""

    async def _extract_params_block(self, page) -> str:
        candidates = [
            '[class*="DetailsBlock"] li',
            '[class*="details"] li',
            '[class*="parameter"] li',
            '[class*="Parameter"]',
            '[class*="characteristic"]',
            'ul[class*="ad-params"] li',
        ]
        pairs: list[str] = []
        for selector in candidates:
            try:
                items = await page.query_selector_all(selector)
            except Exception:
                continue
            for item in items:
                try:
                    text = (await item.inner_text()).strip()
                except Exception:
                    continue
                if not text:
                    continue
                cleaned = self._clean_whitespace(text)
                if cleaned and cleaned not in pairs:
                    pairs.append(cleaned)
            if pairs:
                break
        return " | ".join(pairs)

    @staticmethod
    def _clean_whitespace(value: str) -> str:
        return re.sub(r"\s+", " ", value).strip()

    # ------------------------------------------------------------------
    # Цена
    # ------------------------------------------------------------------
    def _clean_price(self, price_str: str) -> int:
        if not isinstance(price_str, str):
            return 0
        digits = re.sub(r"\D", "", price_str)
        return int(digits) if digits else 0

    def _parse_price(self, price_str: str) -> tuple[int, str]:
        if not isinstance(price_str, str):
            return 0, "KGS"

        text = price_str.lower()
        currency = "KGS"
        if "$" in text or "usd" in text:
            currency = "USD"
        elif "€" in text or "eur" in text:
            currency = "EUR"
        elif "руб" in text or "rub" in text:
            currency = "RUB"

        return self._clean_price(price_str), currency

    def _extract_price_from_text(self, text: str) -> tuple[int, str]:
        if not isinstance(text, str):
            return 0, "KGS"

        currency_match = re.search(
            r"(\d[\d\s]{3,})\s*(сом|с|kgs|usd|\$|eur|€|rub|руб)",
            text,
            flags=re.IGNORECASE,
        )
        if currency_match:
            currency = self._parse_price(currency_match.group(2))[1]
            return self._clean_price(currency_match.group(1)), currency

        for match in re.findall(r"\d[\d\s]{3,}", text):
            price = self._clean_price(match)
            if 5000 <= price <= 1000000:
                return price, "KGS"

        return 0, "KGS"

    # ------------------------------------------------------------------
    # Этап подкачки деталей
    # ------------------------------------------------------------------
    async def _enrich_with_details(self, context, items: list[dict]) -> list[dict]:
        if not items:
            return items

        unique_links: dict[str, int] = {}
        for index, item in enumerate(items):
            link = item.get("link") or ""
            if link and link not in unique_links:
                unique_links[link] = index
        targets = list(unique_links.items())
        if not targets:
            return items

        logger.info(
            f"🔎 Подкачиваем детальные страницы: {len(targets)} объявлений "
            f"(параллельно {settings.DETAIL_CONCURRENCY})"
        )

        semaphore = asyncio.Semaphore(settings.DETAIL_CONCURRENCY)
        progress = tqdm(total=len(targets), desc="Детальные страницы")
        success = 0
        failed = 0

        async def worker(link: str, idx: int):
            nonlocal success, failed
            async with semaphore:
                try:
                    detail = await self._parse_detail(context, link)
                except Exception as e:
                    failed += 1
                    progress.update(1)
                    logger.debug(f"detail worker error {link}: {e}")
                    return

                item = items[idx]
                if detail["description"]:
                    item["description"] = detail["description"]
                if detail["params_extra"]:
                    base_params = item.get("params") or ""
                    merged = (
                        f"{base_params} | {detail['params_extra']}"
                        if base_params
                        else detail["params_extra"]
                    )
                    item["params"] = merged
                if detail["address"] and (
                    not item.get("address") or item["address"] == "N/A"
                ):
                    item["address"] = detail["address"]
                if detail["description"] or detail["params_extra"]:
                    success += 1
                progress.update(1)
                await asyncio.sleep(settings.DETAIL_DELAY_MS / 1000)

        await asyncio.gather(*(worker(link, idx) for link, idx in targets))
        progress.close()
        logger.success(
            f"📥 Детальные страницы: enriched={success}, failed={failed}, "
            f"total={len(targets)}"
        )

        by_link: dict[str, dict] = {}
        for item in items:
            link = item.get("link")
            if not link:
                continue
            if (
                item.get("description")
                or "|" in (item.get("params") or "")
            ):
                by_link.setdefault(link, item)
        for item in items:
            link = item.get("link")
            if not link or item.get("description"):
                continue
            source = by_link.get(link)
            if source and source is not item:
                item["description"] = source["description"]
                item["params"] = source["params"]
                if source.get("address") and item.get("address") in ("", "N/A"):
                    item["address"] = source["address"]

        return items

    # ------------------------------------------------------------------
    # Run
    # ------------------------------------------------------------------
    async def run(self):
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=settings.HEADLESS,
                slow_mo=settings.SLOW_MO,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--disable-features=IsolateOrigins,site-per-process",
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-web-security",
                    "--disable-features=BlockInsecurePrivateNetworkRequests",
                    "--start-maximized",
                ],
            )
            context = await browser.new_context(
                viewport={"width": 1920, "height": 1080},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/131.0.0.0 Safari/537.36"
                ),
                locale="ru-RU",
                timezone_id="Asia/Bishkek",
                extra_http_headers={
                    "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
                    "Accept": (
                        "text/html,application/xhtml+xml,application/xml;q=0.9,"
                        "image/avif,image/webp,*/*;q=0.8"
                    ),
                    "Sec-Ch-Ua": (
                        '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"'
                    ),
                    "Sec-Ch-Ua-Mobile": "?0",
                    "Sec-Ch-Ua-Platform": '"Windows"',
                    "Upgrade-Insecure-Requests": "1",
                },
            )

            # Расширенная маскировка автоматизации.
            # Это критично: Cloudflare детектит navigator.webdriver и другие
            # признаки headless Chromium. Без этого — постоянный challenge loop.
            await context.add_init_script(STEALTH_INIT_SCRIPT)

            page = await context.new_page()

            all_items: list[dict] = []
            consecutive_failures = 0

            for page_num in tqdm(
                range(1, settings.MAX_PAGES + 1), desc="Парсим lalafo.kg"
            ):
                try:
                    items = await self.parse_page(page, page_num)
                    all_items.extend(items)
                    if not items:
                        consecutive_failures += 1
                        # Если 3 подряд страницы провалились — Cloudflare всерьёз
                        # заблокировал. Дальше идти бессмысленно.
                        if consecutive_failures >= 3:
                            logger.error(
                                "🛑 3 страницы подряд без карточек — прерываем парсинг. "
                                "Вероятно, Cloudflare заблокировал бот. Попробуйте позже "
                                "или включите HEADLESS=false и SLOW_MO=2000."
                            )
                            break
                    else:
                        consecutive_failures = 0
                    await asyncio.sleep(4 + (page_num % 5))
                except Exception as e:
                    logger.error(f"Критическая ошибка на странице {page_num}: {e}")
                    continue

            if not all_items:
                await browser.close()
                logger.error("❌ Не удалось собрать ни одного объявления")
                return None

            if settings.PARSE_DETAILS:
                try:
                    all_items = await self._enrich_with_details(context, all_items)
                except Exception as e:
                    logger.error(f"Ошибка на этапе детальных страниц: {e}")
            else:
                logger.info("PARSE_DETAILS=False — пропускаем детальные страницы")

            await browser.close()

            df = pd.DataFrame(all_items)

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            raw_path = settings.RAW_DATA / f"lalafo_raw_{timestamp}.parquet"
            df.to_parquet(raw_path, index=False)
            df.to_csv(settings.RAW_DATA / f"lalafo_raw_{timestamp}.csv", index=False)
            df.to_json(
                settings.RAW_DATA / f"lalafo_raw_{timestamp}.json",
                orient="records",
                force_ascii=False,
            )

            with_desc = int(df["description"].astype(str).str.strip().ne("").sum())
            logger.success(
                f"✅ Парсинг завершён! Собрано {len(df)} объявлений, "
                f"с описанием: {with_desc} ({100 * with_desc / len(df):.0f}%)"
            )
            logger.success(f"📁 Файл сохранён: {raw_path}")
            return df


if __name__ == "__main__":
    parser = LalafoParser()
    asyncio.run(parser.run())
