import joblib
import numpy as np
import pandas as pd
from loguru import logger
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import settings
from models.apartment import Apartment
from processors.extractors import extract_zone
from services.zones import ZONES

# zone_<id> one-hot признаки. Список синхронизирован с services.zones,
# чтобы trainer и predictor использовали ровно одно множество зон.
ZONE_IDS: list[str] = [z["id"] for z in ZONES]
ZONE_FEATURE_COLUMNS: list[str] = [f"zone_{zid}" for zid in ZONE_IDS]


class PricePredictorTrainer:
    MODEL_PATH = settings.BASE_DIR / "data" / "models" / "price_predictor.joblib"
    METRICS_PATH = settings.BASE_DIR / "data" / "models" / "metrics.joblib"

    BASE_FEATURE_COLUMNS: list[str] = [
        "rooms",
        "total_area",
        "floor_num",
        "is_studio",
        "area_per_room",
    ]
    FEATURE_COLUMNS: list[str] = BASE_FEATURE_COLUMNS + ZONE_FEATURE_COLUMNS

    REQUIRED_COLUMNS = ("rooms", "total_area", "price")

    def _coverage(self, df: pd.DataFrame) -> dict:
        n = len(df)
        if n == 0:
            return {}
        cols = ["price", "rooms", "total_area", "floor", "address"]
        return {
            col: {
                "non_null": int(df[col].notna().sum()),
                "pct": round(100 * float(df[col].notna().sum()) / n, 1),
            }
            for col in cols
            if col in df.columns
        }

    def _prepare_features(self, df: pd.DataFrame):
        initial_count = len(df)
        df = df.copy()

        for column in self.REQUIRED_COLUMNS:
            df[column] = pd.to_numeric(df[column], errors="coerce")

        coverage = self._coverage(df)

        per_field_drop = {col: int(df[col].isna().sum()) for col in self.REQUIRED_COLUMNS}
        only_missing = {}
        for col in self.REQUIRED_COLUMNS:
            others = [c for c in self.REQUIRED_COLUMNS if c != col]
            other_present = df[others].notna().all(axis=1)
            only_missing[col] = int((df[col].isna() & other_present).sum())

        before = len(df)
        df = df.dropna(subset=list(self.REQUIRED_COLUMNS))
        dropped_required = before - len(df)

        before = len(df)
        df = df[
            df["rooms"].between(0, 10)
            & df["total_area"].between(10, 500)
            & df["price"].between(5_000, 1_000_000)
        ].copy()
        dropped_range = before - len(df)

        before = len(df)
        if not df.empty:
            df["price_per_m2"] = df["price"] / df["total_area"]
            df = df[df["price_per_m2"].between(100, 100_000)].copy()
        dropped_ppm = before - len(df)

        report = {
            "initial": initial_count,
            "coverage": coverage,
            "missing_per_required_field": per_field_drop,
            "only_missing_this_field": only_missing,
            "dropped_missing_required": dropped_required,
            "dropped_out_of_range": dropped_range,
            "dropped_price_per_m2": dropped_ppm,
            "remaining": len(df),
        }

        logger.info("=== Trainer extraction report ===")
        logger.info(f"  initial rows from DB:        {initial_count}")
        for field, info in coverage.items():
            logger.info(
                f"  coverage[{field}]:".ljust(34)
                + f"{info['non_null']} ({info['pct']}%)"
            )
        for field, count in per_field_drop.items():
            logger.info(f"  missing {field}:".ljust(34) + f"{count}")
        logger.info(f"  dropped (missing required):  {dropped_required}")
        logger.info(f"  dropped (out of range):      {dropped_range}")
        logger.info(f"  dropped (price/m² bounds):   {dropped_ppm}")
        logger.info(f"  remaining for ML:            {len(df)}")

        if df.empty:
            return None, None, report

        # Базовые признаки
        df["floor_num"] = (
            df["floor"]
            .astype(str)
            .str.extract(r"(\d+)", expand=False)
            .astype(float)
            .fillna(1)
        )
        df["is_studio"] = (df["rooms"] == 0).astype(int)
        df["area_per_room"] = np.where(
            df["rooms"] == 0,
            df["total_area"],
            df["total_area"] / df["rooms"].clip(lower=1),
        )

        # Zone one-hot. extract_zone использует address+title, чтобы поймать
        # район даже если он только в заголовке объявления.
        zone_ids = df.apply(
            lambda r: extract_zone(r.get("address"), r.get("title")),
            axis=1,
        )
        for zid in ZONE_IDS:
            df[f"zone_{zid}"] = (zone_ids == zid).astype(int)

        zone_distribution = {
            zid: int(df[f"zone_{zid}"].sum()) for zid in ZONE_IDS
        }
        zone_unknown = int((zone_ids.isna() | (zone_ids == "")).sum())
        report["zone_distribution"] = zone_distribution
        report["zone_unknown"] = zone_unknown
        logger.info(f"  zone distribution:           {zone_distribution}")
        logger.info(f"  zone unknown:                {zone_unknown}")

        x = df[self.FEATURE_COLUMNS]
        y = df["price"]
        return x, y, report

    async def train(self, db: AsyncSession):
        result = await db.execute(select(Apartment))
        apartments = result.scalars().all()

        if len(apartments) < 50:
            logger.warning(
                f"Мало данных для обучения ML: {len(apartments)}. Нужно минимум 50."
            )
            return {
                "status": "error",
                "message": "Недостаточно данных",
                "rows_in_db": len(apartments),
            }

        df = pd.DataFrame(
            [
                {
                    "rooms": apartment.rooms,
                    "total_area": apartment.total_area,
                    "price": apartment.price,
                    "floor": apartment.floor,
                    "address": apartment.address or "",
                    "title": apartment.title or "",
                }
                for apartment in apartments
            ]
        )

        x, y, report = self._prepare_features(df)

        if x is None or len(x) < 20:
            samples = 0 if x is None else len(x)
            logger.warning(
                f"Недостаточно полных данных для обучения. samples={samples}, "
                f"dropped_total={report['initial'] - samples}."
            )
            return {
                "status": "error",
                "message": "Недостаточно полных данных",
                "samples": samples,
                "dropped_samples": report["initial"] - samples,
                "report": report,
            }

        x_train, x_test, y_train, y_test = train_test_split(
            x, y, test_size=0.2, random_state=42
        )

        model = RandomForestRegressor(
            n_estimators=300,
            max_depth=15,
            min_samples_split=5,
            random_state=42,
            n_jobs=-1,
        )
        model.fit(x_train, y_train)

        y_pred = model.predict(x_test)
        mae = mean_absolute_error(y_test, y_pred)
        rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
        median_ae = float(np.median(np.abs(y_test - y_pred)))
        mape = float(np.mean(np.abs((y_test - y_pred) / y_test)) * 100)
        r2 = r2_score(y_test, y_pred)
        baseline_pred = np.full(shape=len(y_test), fill_value=float(y_train.median()))
        baseline_mae = mean_absolute_error(y_test, baseline_pred)

        # Feature importance — пригодится в API/UI, чтобы видеть какой признак важнее
        feature_importance = {
            feature: float(importance)
            for feature, importance in zip(
                self.FEATURE_COLUMNS, model.feature_importances_
            )
        }

        logger.success(f"Модель KyrgPulse обучена на {len(x)} объявлениях")
        logger.success(f"MAE: {mae:,.0f} KGS | RMSE: {rmse:,.0f} KGS | R2: {r2:.3f}")

        self.MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(model, self.MODEL_PATH)
        joblib.dump(
            {
                "mae": float(mae),
                "rmse": rmse,
                "median_absolute_error": median_ae,
                "mape_percent": mape,
                "r2": float(r2),
                "baseline_mae": float(baseline_mae),
                "trained_on": len(x),
                "dropped_samples": report["initial"] - len(x),
                "features": self.FEATURE_COLUMNS,
                "feature_importance": feature_importance,
                "trained_at": pd.Timestamp.now().isoformat(),
                "currency": "KGS",
            },
            self.METRICS_PATH,
        )

        return {
            "status": "success",
            "mae": float(mae),
            "rmse": rmse,
            "median_absolute_error": median_ae,
            "mape_percent": mape,
            "r2": float(r2),
            "baseline_mae": float(baseline_mae),
            "samples": len(x),
            "dropped_samples": report["initial"] - len(x),
            "features": self.FEATURE_COLUMNS,
            "feature_importance": feature_importance,
            "report": report,
        }
