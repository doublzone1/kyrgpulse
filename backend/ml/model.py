import re
from typing import Optional

import joblib
import numpy as np
from loguru import logger

from config.settings import settings
from processors.extractors import extract_zone
from services.zones import ZONES

ZONE_IDS: list[str] = [z["id"] for z in ZONES]


class PricePredictor:
    """Inference обёртка над обученной моделью.

    Поддерживает несколько схем фичей одновременно — текущую (с zone one-hot)
    и две легаси-схемы — чтобы старые .joblib-файлы продолжали работать после
    обновления кода.
    """

    BASE_FEATURE_COLUMNS = [
        "rooms",
        "total_area",
        "floor_num",
        "is_studio",
        "area_per_room",
    ]
    ZONE_FEATURE_COLUMNS = [f"zone_{zid}" for zid in ZONE_IDS]
    FEATURE_COLUMNS = BASE_FEATURE_COLUMNS + ZONE_FEATURE_COLUMNS

    # Старые версии модели — оставлены для backward-compat
    LEGACY_FEATURE_COLUMNS_V2 = [
        "rooms",
        "total_area",
        "floor_num",
        "is_studio",
        "is_central",
        "area_per_room",
    ]
    LEGACY_FEATURE_COLUMNS_V1 = [
        "rooms",
        "total_area",
        "floor_num",
        "is_studio",
        "is_central",
    ]

    def __init__(self):
        self.model_path = settings.BASE_DIR / "data" / "models" / "price_predictor.joblib"
        self.metrics_path = settings.BASE_DIR / "data" / "models" / "metrics.joblib"
        self.model = None
        self.metrics: Optional[dict] = None
        self._loaded_mtime: float = 0.0
        self._load_model()

    def _load_model(self) -> None:
        if not self.model_path.exists():
            self.model = None
            self.metrics = None
            self._loaded_mtime = 0.0
            logger.warning(
                "ML-модель ещё не обучена. Выполни POST /api/analytics/train-model"
            )
            return
        try:
            self.model = joblib.load(self.model_path)
            self.metrics = (
                joblib.load(self.metrics_path) if self.metrics_path.exists() else None
            )
            self._loaded_mtime = self.model_path.stat().st_mtime
            n_features = getattr(self.model, "n_features_in_", "?")
            logger.info(
                f"ML-модель KyrgPulse загружена (n_features={n_features})"
            )
        except Exception:
            self.model = None
            self.metrics = None
            self._loaded_mtime = 0.0
            logger.exception(
                "Не удалось загрузить ML-модель. Переобучите через "
                "POST /api/analytics/train-model."
            )

    def _maybe_reload(self) -> None:
        """Hot reload: если файл модели обновился — подхватываем без рестарта.

        Нужно для celery beat — после ночного переобучения backend сразу
        начинает использовать свежую модель, без `docker compose restart`.
        """
        if not self.model_path.exists():
            if self.model is not None:
                logger.warning("Файл модели исчез — сбрасываем загруженную модель")
                self.model = None
                self.metrics = None
                self._loaded_mtime = 0.0
            return
        try:
            current_mtime = self.model_path.stat().st_mtime
        except OSError:
            return
        if current_mtime > self._loaded_mtime:
            logger.info("Обнаружена обновлённая модель — перезагружаем")
            self._load_model()

    def _floor_number(self, floor: str) -> int:
        floor_digits = re.findall(r"\d+", str(floor))
        if not floor_digits:
            return 1
        return max(1, int(floor_digits[0]))

    def _resolve_columns(self) -> list[str]:
        """Подбирает набор колонок под количество фичей в загруженной модели."""
        n = getattr(self.model, "n_features_in_", len(self.FEATURE_COLUMNS))
        if n == len(self.FEATURE_COLUMNS):
            return self.FEATURE_COLUMNS
        if n == len(self.LEGACY_FEATURE_COLUMNS_V2):
            return self.LEGACY_FEATURE_COLUMNS_V2
        if n == len(self.LEGACY_FEATURE_COLUMNS_V1):
            return self.LEGACY_FEATURE_COLUMNS_V1
        # На всякий случай — fallback на текущую схему
        logger.warning(
            f"Неожиданное n_features_in_={n}. Используем текущую схему фичей."
        )
        return self.FEATURE_COLUMNS

    def _features(
        self,
        rooms: int,
        total_area: float,
        floor: str = "1",
        address: str = "",
        zone: Optional[str] = None,
    ) -> np.ndarray:
        floor_num = self._floor_number(floor)
        is_studio = 1 if rooms == 0 else 0
        area_per_room = total_area if rooms == 0 else total_area / max(rooms, 1)

        # Если zone не передан — пытаемся определить по адресу
        resolved_zone = zone or extract_zone(address)

        # is_central оставлен для backward-compat со старыми моделями
        is_central = int(
            bool(
                re.search(
                    r"центр|цум|гум|ала-?тоо|токтогула|киевская|советская|эркиндик",
                    str(address),
                    flags=re.IGNORECASE,
                )
            )
        )

        values: dict[str, float] = {
            "rooms": float(rooms),
            "total_area": float(total_area),
            "floor_num": float(floor_num),
            "is_studio": float(is_studio),
            "is_central": float(is_central),
            "area_per_room": float(area_per_room),
        }
        for zid in ZONE_IDS:
            values[f"zone_{zid}"] = 1.0 if resolved_zone == zid else 0.0

        columns = self._resolve_columns()
        return np.array([[values[c] for c in columns]], dtype=float)

    def predict(
        self,
        rooms: int,
        total_area: float,
        floor: str = "1",
        address: str = "",
        zone: Optional[str] = None,
    ) -> dict:
        self._maybe_reload()
        if not self.model:
            raise RuntimeError(
                "ML-модель не обучена. Запусти POST /api/analytics/train-model "
                "после загрузки данных."
            )

        features = self._features(
            rooms=rooms,
            total_area=total_area,
            floor=floor,
            address=address,
            zone=zone,
        )
        predicted_price = int(max(0, round(self.model.predict(features)[0])))
        price_per_m2 = (
            round(predicted_price / total_area, 2) if total_area > 0 else 0
        )
        model_mae = self.metrics.get("mae") if self.metrics else None
        model_r2 = self.metrics.get("r2") if self.metrics else None

        return {
            "predicted_price": predicted_price,
            "price_per_m2": price_per_m2,
            "confidence": None,
            "model_status": "trained",
            "model_mae": model_mae,
            "model_r2": model_r2,
            "note": "Confidence не показывается: вместо выдуманной точности API возвращает фактические метрики модели.",
        }
