"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import type { Apartment } from "@/lib/api";

// Fix для иконок Leaflet в Next.js — выполняется один раз при импорте модуля
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })
  ._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface Zone {
  id: string;
  label: string;
  position: [number, number];
  keywords: string[];
}

interface LeafletMapProps {
  center: [number, number];
  zoom: number;
  groups: Array<{ zone: Zone; apartments: Apartment[]; avgPrice?: number }>;
  globalAvgPrice?: number;
  onZoneClick?: (zoneId: string) => void;
  geocodedApartments?: Apartment[];
}

function priceColor(avgPrice: number, globalAvg: number): string {
  if (globalAvg === 0) return "#2dd4bf";
  const ratio = avgPrice / globalAvg;
  if (ratio < 0.85) return "#22c55e";
  if (ratio < 0.97) return "#86efac";
  if (ratio < 1.04) return "#2dd4bf";
  if (ratio < 1.15) return "#f59e0b";
  return "#f43f5e";
}

/**
 * Pure Leaflet map без react-leaflet.
 *
 * Почему так: react-leaflet@4.2.1 ломается на React 18+ StrictMode и
 * Next.js 16 + Turbopack — внутренний MapContainer state не успевает
 * синхронизироваться с двойным mount/unmount, и второй mount падает
 * с "Map container is already initialized".
 *
 * Здесь мы создаём карту вручную через L.map() в useEffect и гарантированно
 * вызываем map.remove() в cleanup. Это полностью контролируемый lifecycle:
 *   - StrictMode mount #1: создали карту на DOM-узле
 *   - StrictMode unmount: map.remove() снимает _leaflet_id с DOM-узла
 *   - StrictMode mount #2: создаём новую карту на чистом DOM-узле
 *
 * Hot reload работает по той же схеме — cleanup чистит DOM перед remount.
 */
export default function LeafletMap({ center, zoom, groups, globalAvgPrice, onZoneClick, geocodedApartments }: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef({ center, zoom, groups, onZoneClick, globalAvgPrice, geocodedApartments });
  propsRef.current = { center, zoom, groups, onZoneClick, globalAvgPrice, geocodedApartments };

  // Инициализация карты — один раз на mount, cleanup на unmount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Защита от случая, когда DOM-узел уже помечен Leaflet'ом
    // (например, после неудачного предыдущего mount).
    if ((container as unknown as { _leaflet_id?: number })._leaflet_id) {
      delete (container as unknown as { _leaflet_id?: number })._leaflet_id;
    }

    const { center: initialCenter, zoom: initialZoom } = propsRef.current;

    const map = L.map(container, {
      center: initialCenter,
      zoom: initialZoom,
      scrollWheelZoom: false,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Слой для маркеров — отдельная группа, чтобы её было удобно очищать
    // при изменении данных без пересоздания самой карты.
    const markersLayer = L.layerGroup().addTo(map);

    // Сохраняем ссылки на map и слой маркеров на DOM-узле,
    // чтобы второй useEffect (обновление маркеров) мог их найти.
    const ref = container as unknown as {
      __map?: L.Map;
      __markersLayer?: L.LayerGroup;
    };
    ref.__map = map;
    ref.__markersLayer = markersLayer;

    // Перерасчёт размеров на случай скрытого/ещё-не-замеренного контейнера
    map.invalidateSize();

    return () => {
      map.remove();
      ref.__map = undefined;
      ref.__markersLayer = undefined;
    };
  }, []);

  // Отдельный эффект — рисуем/перерисовываем маркеры при изменении groups.
  // Карта при этом не пересоздаётся.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ref = container as unknown as {
      __map?: L.Map;
      __markersLayer?: L.LayerGroup;
    };
    const map = ref.__map;
    const markersLayer = ref.__markersLayer;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();

    if (groups.length === 0) return;

    const isUnknownZone = (zoneId: string) => zoneId === "unknown";

    // Heat overlay — large translucent circles (radius in meters) behind markers
    groups.forEach(({ zone, avgPrice }) => {
      if (isUnknownZone(zone.id)) return;
      const gAvg = propsRef.current.globalAvgPrice ?? 0;
      const zColor = avgPrice && gAvg ? priceColor(avgPrice, gAvg) : "#2dd4bf";
      L.circle(zone.position, {
        radius: 2400,
        color: "transparent",
        fillColor: zColor,
        fillOpacity: 0.11,
        interactive: false,
      }).addTo(markersLayer);
    });

    groups.forEach(({ zone, apartments, avgPrice }) => {
      const radius = Math.min(34, 12 + apartments.length * 2);
      const isUnknown = isUnknownZone(zone.id);
      const gAvg = propsRef.current.globalAvgPrice ?? 0;
      const zColor = isUnknown
        ? "#fbbf24"
        : avgPrice && gAvg
        ? priceColor(avgPrice, gAvg)
        : "#2dd4bf";
      const color = zColor;
      const fillColor = zColor;

      const marker = L.circleMarker(zone.position, {
        radius,
        color,
        fillColor,
        fillOpacity: 0.32,
        weight: 2,
      });

      // Подпись с количеством объявлений прямо в центре маркера.
      const label = L.divIcon({
        className: "kp-zone-label",
        html: `<div style="
          width:${radius * 2}px;
          height:${radius * 2}px;
          display:flex;align-items:center;justify-content:center;
          color:#0a0a0a;font-weight:700;font-size:12px;
          font-family:'Space Grotesk',ui-monospace,monospace;
          pointer-events:none;
        ">${apartments.length}</div>`,
        iconSize: [radius * 2, radius * 2],
        iconAnchor: [radius, radius],
      });
      const labelMarker = L.marker(zone.position, {
        icon: label,
        interactive: false,
        keyboard: false,
      });

      const links = apartments
        .slice(0, 4)
        .map(
          (apartment) =>
            `<a href="${apartment.link}" target="_blank" rel="noreferrer" style="display:block;color:#5eead4;font-size:12px;margin-top:4px;">${apartment.price.toLocaleString(
              "ru-RU",
            )} KGS · ${escapeHtml(apartment.title)}</a>`,
        )
        .join("");

      const note = isUnknown
        ? "Зона не распознана из адреса — показано в центре Бишкека"
        : "Приблизительная зона, не точный адрес";

      const popupHtml = `
        <div style="min-width:220px">
          <p style="font-weight:700;font-size:14px;margin-bottom:4px;color:#f5f5f4;">${escapeHtml(zone.label)}</p>
          <p style="color:#a1a1aa;font-size:12px;margin-bottom:8px;">${note}</p>
          <p style="color:#fbbf24;font-weight:700;margin-bottom:8px;">${apartments.length} объявл.${avgPrice ? ` · ср. ${Math.round(avgPrice).toLocaleString("ru-RU")} KGS` : ""}</p>
          ${links}
          ${
            !isUnknown && propsRef.current.onZoneClick
              ? `<button data-kp-zone-action="${zone.id}" style="margin-top:8px;width:100%;padding:6px 10px;border:0;border-radius:6px;background:#2dd4bf;color:#0a0a0a;font-weight:600;font-size:12px;cursor:pointer;">Показать все в этой зоне</button>`
              : ""
          }
        </div>
      `;

      marker.bindPopup(popupHtml);
      // Клик по самому маркеру тоже фильтрует — popup только для квартир без зоны.
      if (!isUnknown && onZoneClick) {
        marker.on("click", () => {
          propsRef.current.onZoneClick?.(zone.id);
        });
        marker.options.bubblingMouseEvents = false;
      }
      marker.addTo(markersLayer);
      labelMarker.addTo(markersLayer);
    });

    // Geocoded individual apartment pins
    const geocoded = propsRef.current.geocodedApartments ?? [];
    const gAvgForPins = propsRef.current.globalAvgPrice ?? 0;
    geocoded.forEach((apt) => {
      if (apt.lat == null || apt.lng == null) return;
      const pinColor = gAvgForPins ? priceColor(apt.price, gAvgForPins) : "#2dd4bf";
      const pin = L.circleMarker([apt.lat, apt.lng], {
        radius: 5,
        color: "#0f172a",
        weight: 1,
        fillColor: pinColor,
        fillOpacity: 0.85,
      });
      const priceStr = apt.price.toLocaleString("ru-RU");
      const area = apt.total_area ? ` · ${apt.total_area} м²` : "";
      pin.bindPopup(
        `<div style="min-width:180px">
          <p style="font-weight:700;font-size:13px;color:#f5f5f4;">${escapeHtml(apt.title)}</p>
          <p style="color:#fbbf24;font-weight:600;margin:4px 0;">${priceStr} KGS${area}</p>
          <a href="${apt.link}" target="_blank" rel="noreferrer" style="color:#5eead4;font-size:12px;">Открыть объявление</a>
        </div>`,
      );
      pin.addTo(markersLayer);
    });

    // Кнопка "Показать все в этой зоне" внутри popup'а — обрабатываем клик
    // через делегирование на самой карте.
    map.on("popupopen", (e) => {
      const node = e.popup.getElement();
      if (!node) return;
      const button = node.querySelector<HTMLButtonElement>("[data-kp-zone-action]");
      if (!button) return;
      const handler = () => {
        const zid = button.getAttribute("data-kp-zone-action");
        if (zid) propsRef.current.onZoneClick?.(zid);
      };
      button.addEventListener("click", handler, { once: true });
    });

    // Подгоняем zoom под все маркеры, чтобы пользователь сразу видел
    // распределение, а не пустую часть карты.
    if (groups.length > 1) {
      const bounds = L.latLngBounds(groups.map((g) => g.zone.position));
      map.fitBounds(bounds.pad(0.25), { animate: false, maxZoom: 13 });
    }
  }, [groups, geocodedApartments]);

  // Реагируем на смену center/zoom без пересоздания карты
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const map = (container as unknown as { __map?: L.Map }).__map;
    if (!map) return;
    map.setView(center, zoom);
  }, [center, zoom]);

  return (
    <div
      ref={containerRef}
      style={{ height: "100%", width: "100%", background: "#0f172a" }}
    />
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
