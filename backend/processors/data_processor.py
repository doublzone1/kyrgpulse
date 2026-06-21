import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional

import pandas as pd
from loguru import logger
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from tqdm import tqdm

from config.database import AsyncSessionLocal, init_db
from config.settings import settings
from models.apartment import Apartment
from models.price_history import PriceHistory
from processors.extractors import (
    extract_area,
    extract_floor,
    extract_furniture,
    extract_house_type,
    extract_internet,
    extract_new_building,
    extract_parking,
    extract_price,
    extract_rental_type,
    extract_rooms,
    extract_zone,
)
from services.currency_service import currency_service
from services.deduplication import mark_duplicates


VALID_CURRENCIES = {"KGS", "USD", "EUR", "RUB"}


class DataProcessor:
    REQUIRED_COLUMNS = [
        "title",
        "price",
        "address",
        "link",
        "params",
        "parsed_at",
        "source",
        "currency",
    ]

    def __init__(self):
        self.raw_dir = settings.RAW_DATA
        self.processed_dir = settings.PROCESSED_DATA

    def _get_latest_raw_file(self) -> Path:
        files = list(self.raw_dir.glob("lalafo_raw_*.parquet"))
        if not files:
            raise FileNotFoundError(
                "No raw data. Run parser first:\n"
                "docker exec -it kyrgpulse-backend python -m parsers.lalafo_parser"
            )
        latest = max(files, key=lambda x: x.stat().st_mtime)
        logger.info(f"Using latest raw file: {latest.name}")
        return latest

    def _none_if_nan(self, value):
        return None if pd.isna(value) else value

    def _optional_int(self, value):
        value = self._none_if_nan(value)
        return int(value) if value is not None else None

    def _optional_float(self, value):
        value = self._none_if_nan(value)
        return float(value) if value is not None else None

    def _resolve_price(self, row) -> tuple[Optional[int], Optional[str]]:
        """Возвращает (amount, currency_code) либо (None, None).

        Сначала доверяем парсеру (price + currency из карточки), затем
        fallback на extract_price() по тексту title+params.
        """
        raw_price = row.get("price")
        try:
            parsed = float(raw_price) if raw_price is not None else 0.0
        except (TypeError, ValueError):
            parsed = 0.0

        if parsed > 0:
            raw_currency = str(row.get("currency") or "").strip().upper()
            currency: Optional[str] = (
                raw_currency if raw_currency in VALID_CURRENCIES else None
            )
            if currency is None:
                _, currency = extract_price(row.get("title"), row.get("params"))
            return int(round(parsed)), currency or "KGS"

        return extract_price(row.get("title"), row.get("params"))

    def _price_to_kgs(
        self, price: Optional[int], currency: Optional[str], rates: dict[str, float]
    ) -> Optional[int]:
        if not price or price <= 0:
            return None
        if not currency or currency == "KGS":
            return int(price)
        rate = rates.get(currency)
        if not rate:
            return None
        return int(round(price / rate))

    def _prepare_dataframe(
        self, df: pd.DataFrame, rates: dict[str, float]
    ) -> tuple[pd.DataFrame, dict]:
        """Нормализует raw DataFrame и возвращает (cleaned_df, drop_stats)."""
        stats = {
            "raw": len(df),
            "dropped_no_link_or_title": 0,
            "dropped_no_price": 0,
            "dropped_price_out_of_range": 0,
            "dropped_unsupported_currency": 0,
        }

        df = df.copy()
        for column in self.REQUIRED_COLUMNS:
            if column not in df.columns:
                df[column] = None

        for column in ("title", "address", "link", "params", "source"):
            df[column] = df[column].fillna("").astype(str).str.strip()

        # description — опциональная колонка из обновлённого парсера
        if "description" not in df.columns:
            df["description"] = ""
        df["description"] = df["description"].fillna("").astype(str).str.strip()

        before = len(df)
        df = df[(df["link"] != "") & (df["title"] != "")].copy()
        stats["dropped_no_link_or_title"] = before - len(df)

        prices_kgs: list[Optional[int]] = []
        currencies: list[Optional[str]] = []
        for _, row in df.iterrows():
            amount, currency = self._resolve_price(row)
            if amount is None:
                prices_kgs.append(None)
                currencies.append(None)
                continue
            currencies.append(currency)
            prices_kgs.append(self._price_to_kgs(amount, currency, rates))

        df["detected_currency"] = currencies
        df["price"] = prices_kgs

        no_price_mask = df["price"].isna()
        unsupported_mask = no_price_mask & df["detected_currency"].isin(
            VALID_CURRENCIES - {"KGS"}
        )
        stats["dropped_unsupported_currency"] = int(unsupported_mask.sum())
        stats["dropped_no_price"] = int(no_price_mask.sum() - unsupported_mask.sum())

        df = df.dropna(subset=["price"]).copy()
        df["price"] = df["price"].astype(int)

        before = len(df)
        df = df[df["price"].between(5_000, 1_000_000)].copy()
        stats["dropped_price_out_of_range"] = before - len(df)

        df["rooms"] = [
            extract_rooms(row.get("title"), row.get("params"), row.get("description"))
            for _, row in df.iterrows()
        ]
        df["total_area"] = [
            extract_area(row.get("title"), row.get("params"), row.get("description"))
            for _, row in df.iterrows()
        ]
        df["floor"] = [
            extract_floor(row.get("title"), row.get("params"), row.get("description"))
            for _, row in df.iterrows()
        ]
        df["zone"] = [
            extract_zone(
                row.get("address"),
                row.get("title"),
                row.get("params"),
                row.get("description"),
            )
            for _, row in df.iterrows()
        ]
        df["furniture"] = [
            extract_furniture(
                row.get("title"), row.get("params"), row.get("description")
            )
            for _, row in df.iterrows()
        ]
        df["rental_type"] = [
            extract_rental_type(
                row.get("title"), row.get("params"), row.get("description")
            )
            for _, row in df.iterrows()
        ]

        df["price_per_m2"] = [
            round(row["price"] / row["total_area"], 2)
            if row.get("total_area") and row["total_area"] > 0
            else None
            for _, row in df.iterrows()
        ]
        df["house_type"] = [
            extract_house_type(row.get("title"), row.get("params"), row.get("description"))
            for _, row in df.iterrows()
        ]
        df["has_internet"] = [
            extract_internet(row.get("title"), row.get("params"), row.get("description"))
            for _, row in df.iterrows()
        ]
        df["has_parking"] = [
            extract_parking(row.get("title"), row.get("params"), row.get("description"))
            for _, row in df.iterrows()
        ]
        df["is_new_building"] = [
            extract_new_building(row.get("title"), row.get("params"), row.get("description"))
            for _, row in df.iterrows()
        ]
        df["processed_at"] = datetime.now()
        df["currency"] = "KGS"
        df = self._detect_anomalies(df)
        return df, stats

    def _detect_anomalies(self, df: pd.DataFrame) -> pd.DataFrame:
        """Flag price_per_m2 outliers via IQR (3×) per rooms group."""
        df = df.copy()
        df["is_price_anomaly"] = False
        for rooms_val in df["rooms"].unique():
            if rooms_val is None or (isinstance(rooms_val, float) and pd.isna(rooms_val)):
                continue
            mask = df["rooms"] == rooms_val
            vals = df.loc[mask & df["price_per_m2"].notna(), "price_per_m2"]
            if len(vals) < 5:
                continue
            q1, q3 = vals.quantile(0.25), vals.quantile(0.75)
            iqr = q3 - q1
            lower, upper = q1 - 3 * iqr, q3 + 3 * iqr
            anomaly = mask & df["price_per_m2"].notna() & (
                (df["price_per_m2"] < lower) | (df["price_per_m2"] > upper)
            )
            df.loc[anomaly, "is_price_anomaly"] = True
        flagged = int(df["is_price_anomaly"].sum())
        if flagged:
            logger.info(f"Anomaly detection: {flagged} listings flagged")
        return df

    def _coverage_stats(self, df: pd.DataFrame) -> dict:
        n = len(df)
        if n == 0:
            return {}

        def coverage(column: str) -> dict:
            non_null = int(df[column].notna().sum())
            return {"count": non_null, "pct": round(100 * non_null / n, 1)}

        valid_for_ml = int(
            (df["rooms"].notna() & df["total_area"].notna()).sum()
        )
        return {
            "rows": n,
            "with_area": coverage("total_area"),
            "with_rooms": coverage("rooms"),
            "with_floor": coverage("floor"),
            "with_zone": coverage("zone"),
            "with_furniture": coverage("furniture"),
            "with_rental_type": coverage("rental_type"),
            "with_price_per_m2": coverage("price_per_m2"),
            "valid_for_ml": {
                "count": valid_for_ml,
                "pct": round(100 * valid_for_ml / n, 1),
            },
        }

    def _log_summary(self, drop_stats: dict, coverage: dict) -> None:
        logger.info("=== Extraction summary ===")
        logger.info(f"  raw rows:                {drop_stats.get('raw', 0)}")
        logger.info(
            f"  dropped (no link/title): {drop_stats.get('dropped_no_link_or_title', 0)}"
        )
        logger.info(
            f"  dropped (no price):      {drop_stats.get('dropped_no_price', 0)}"
        )
        logger.info(
            f"  dropped (no FX rate):    {drop_stats.get('dropped_unsupported_currency', 0)}"
        )
        logger.info(
            f"  dropped (price OOR):     {drop_stats.get('dropped_price_out_of_range', 0)}"
        )

        if not coverage:
            logger.warning("  No rows survived cleaning")
            return

        rows = coverage["rows"]
        logger.info(f"  cleaned rows:            {rows}")

        def fmt(label: str, key: str) -> None:
            c = coverage[key]
            logger.info(f"  {label:<24} {c['count']:>5} ({c['pct']}%)")

        fmt("with area:", "with_area")
        fmt("with rooms:", "with_rooms")
        fmt("with floor:", "with_floor")
        fmt("with zone:", "with_zone")
        fmt("with furniture:", "with_furniture")
        fmt("with rental type:", "with_rental_type")
        fmt("with price/m²:", "with_price_per_m2")
        fmt("valid for ML:", "valid_for_ml")

    async def process(self):
        await init_db()

        raw_file = self._get_latest_raw_file()
        logger.info(f"Processing: {raw_file.name}")

        df = pd.read_parquet(raw_file)
        rates = await currency_service.get_rates()
        df, drop_stats = self._prepare_dataframe(df, rates)

        if df.empty:
            self._log_summary(drop_stats, {})
            logger.error(
                "No valid listings left after cleaning. "
                "Rerun parser or inspect raw data."
            )
            return

        coverage = self._coverage_stats(df)
        self._log_summary(drop_stats, coverage)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        processed_path = self.processed_dir / f"lalafo_processed_{timestamp}.parquet"
        df.to_parquet(processed_path, index=False)
        logger.success(f"Processed dataset saved: {processed_path.name}")

        async with AsyncSessionLocal() as session:
            # Batch-fetch existing apartments to track price changes
            links_batch = df["link"].tolist()
            existing_result = await session.execute(
                select(Apartment.link, Apartment.id, Apartment.price)
                .where(Apartment.link.in_(links_batch))
            )
            existing_map: dict[str, tuple[int, int]] = {
                r.link: (r.id, r.price) for r in existing_result.all()
            }

            for index, row in tqdm(df.iterrows(), total=len(df), desc="Loading to DB"):
                try:
                    parsed_at = pd.to_datetime(row.get("parsed_at"), errors="coerce")
                    values = {
                        "link": row["link"],
                        "title": row["title"],
                        "price": int(row["price"]),
                        "price_per_m2": self._optional_float(row.get("price_per_m2")),
                        "address": self._none_if_nan(row.get("address")) or None,
                        "rooms": self._optional_int(row.get("rooms")),
                        "total_area": self._optional_float(row.get("total_area")),
                        "floor": self._none_if_nan(row.get("floor")),
                        "params": self._none_if_nan(row.get("params")),
                        "source": row.get("source", "lalafo") or "lalafo",
                        "currency": "KGS",
                        "is_price_anomaly": bool(row.get("is_price_anomaly") or False),
                        "image_url": self._none_if_nan(row.get("image_url")) or None,
                        "house_type": self._none_if_nan(row.get("house_type")) or None,
                        "has_internet": self._none_if_nan(row.get("has_internet")),
                        "has_parking": self._none_if_nan(row.get("has_parking")),
                        "is_new_building": self._none_if_nan(row.get("is_new_building")),
                        "search_vector": func.to_tsvector(
                            "russian",
                            " ".join(filter(None, [
                                self._none_if_nan(row.get("title")) or "",
                                self._none_if_nan(row.get("address")) or "",
                                self._none_if_nan(row.get("params")) or "",
                            ])),
                        ),
                        "first_seen_at": parsed_at.to_pydatetime()
                        if not pd.isna(parsed_at)
                        else datetime.now(),
                        "parsed_at": parsed_at.to_pydatetime()
                        if not pd.isna(parsed_at)
                        else datetime.now(),
                    }

                    stmt = (
                        insert(Apartment)
                        .values(**values)
                        .on_conflict_do_update(
                            index_elements=["link"],
                            set_={
                                **{
                                    k: v
                                    for k, v in values.items()
                                    # first_seen_at never updated on conflict — keeps original date
                                    if k not in {"link", "parsed_at", "first_seen_at", "search_vector"}
                                },
                                "processed_at": datetime.now(),
                                "search_vector": func.to_tsvector(
                                    "russian",
                                    func.concat(
                                        func.coalesce(values["title"], ""),
                                        " ",
                                        func.coalesce(values.get("address") or "", ""),
                                        " ",
                                        func.coalesce(values.get("params") or "", ""),
                                    ),
                                ),
                            },
                        )
                    )
                    await session.execute(stmt)

                    # Record price change in history + track drops
                    apt_link = row["link"]
                    new_price = values["price"]
                    if apt_link in existing_map:
                        apt_id, old_price = existing_map[apt_link]
                        if old_price != new_price and old_price != 0:
                            change_pct = round((new_price - old_price) / old_price * 100, 2)
                            session.add(PriceHistory(
                                apartment_id=apt_id,
                                price=new_price,
                                change_pct=change_pct,
                            ))
                            if new_price < old_price:
                                from sqlalchemy import update as sa_update
                                await session.execute(
                                    sa_update(Apartment)
                                    .where(Apartment.id == apt_id)
                                    .values(price_drop_count=Apartment.price_drop_count + 1)
                                )

                    if (index + 1) % 50 == 0:
                        await session.commit()
                except Exception as e:
                    logger.warning(f"Insert failed for {row.get('link')}: {e}")
                    continue

            await session.commit()
            await mark_duplicates(session)

        logger.success(f"Loaded/updated {len(df)} listings in database.")


if __name__ == "__main__":
    processor = DataProcessor()
    asyncio.run(processor.process())
