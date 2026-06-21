"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";
import type { Apartment } from "@/lib/api";

const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[420px] flex flex-col items-center justify-center gap-3 bg-surface-card rounded-lg border border-surface-border">
      <MapPin className="w-7 h-7 text-neutral-700 animate-pulse" />
      <p className="text-sm text-neutral-500">Загрузка карты...</p>
    </div>
  ),
});

interface Props {
  apartments: Apartment[];
  onZoneClick?: (zoneId: string) => void;
}

interface Zone {
  id: string;
  label: string;
  position: [number, number];
  keywords: string[];
}

const BISHKEK_CENTER: [number, number] = [42.8746, 74.5698];

const ZONES: Zone[] = [
  {
    id: "center",
    label: "Центр",
    position: [42.875, 74.604],
    keywords: ["центр", "ала-тоо", "цум", "гум", "киевская", "токтогула", "эркиндик"],
  },
  {
    id: "south",
    label: "Южная часть",
    position: [42.835, 74.615],
    keywords: ["южн", "магистраль", "асанбе", "кок-жар", "кок жар", "джал", "жал"],
  },
  {
    id: "east",
    label: "Восточная часть",
    position: [42.865, 74.68],
    keywords: ["восток", "аламедин", "лебединовка", "ташырабат", "ташы рабат"],
  },
  {
    id: "west",
    label: "Западная часть",
    position: [42.88, 74.52],
    keywords: ["запад", "ошский", "кулиева", "ак-ордо", "ак ордо", "арча-бешик"],
  },
  {
    id: "north",
    label: "Северная часть",
    position: [42.91, 74.6],
    keywords: ["север", "дордой", "манас", "жибек жолу"],
  },
  {
    id: "microdistricts",
    label: "Микрорайоны",
    position: [42.845, 74.585],
    keywords: ["мкр", "микрорайон", "12 мкр", "11 мкр", "10 мкр", "7 мкр", "6 мкр", "5 мкр"],
  },
];

const UNKNOWN_ZONE: Zone = {
  id: "unknown",
  label: "Без точной зоны",
  position: [42.8746, 74.5698],
  keywords: [],
};

function detectZone(apartment: Apartment): Zone | null {
  const text = `${apartment.address || ""} ${apartment.title || ""}`.toLowerCase();
  return (
    ZONES.find((zone) => zone.keywords.some((kw) => text.includes(kw))) ?? null
  );
}

export default function MapView({ apartments, onZoneClick }: Props) {
  const { groups, total, unknownCount, globalAvgPrice, geocodedApartments } = useMemo(() => {
    const grouped = new Map<string, { zone: Zone; apartments: Apartment[] }>();
    const unknownApts: Apartment[] = [];
    const geocoded: Apartment[] = [];

    apartments.forEach((apartment) => {
      // Apartments with real coordinates get a precise pin — don't also put them in zone groups
      if (apartment.lat != null && apartment.lng != null) {
        geocoded.push(apartment);
        return;
      }
      const zone = detectZone(apartment);
      if (!zone) {
        unknownApts.push(apartment);
        return;
      }
      const current = grouped.get(zone.id) || { zone, apartments: [] };
      current.apartments.push(apartment);
      grouped.set(zone.id, current);
    });

    const result = Array.from(grouped.values());

    if (unknownApts.length > 0) {
      result.push({ zone: UNKNOWN_ZONE, apartments: unknownApts });
    }

    const withPrices = result.map((g) => ({
      ...g,
      avgPrice:
        g.apartments.length > 0
          ? g.apartments.reduce((s, a) => s + a.price, 0) / g.apartments.length
          : 0,
    }));

    const globalAvgPrice =
      apartments.length > 0
        ? apartments.reduce((s, a) => s + a.price, 0) / apartments.length
        : 0;

    return {
      groups: withPrices,
      globalAvgPrice,
      total: apartments.length,
      unknownCount: unknownApts.length,
      geocodedApartments: geocoded,
    };
  }, [apartments]);

  if (apartments.length === 0) {
    return (
      <div className="h-[420px] flex flex-col items-center justify-center gap-3 bg-surface-card rounded-lg border border-surface-border">
        <div className="w-12 h-12 rounded-full bg-surface-raised flex items-center justify-center">
          <MapPin className="w-5 h-5 text-neutral-600" />
        </div>
        <div className="text-center">
          <p className="text-sm text-neutral-400">Нет квартир для отображения</p>
          <p className="text-xs text-neutral-600 mt-1">
            Данные появятся после запуска парсера
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Meta row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-500 max-w-sm leading-relaxed">
          Маркеры — приблизительные зоны по тексту адреса. Размер кружка пропорционален числу объявлений.
        </p>
        <p className="font-numeric text-xs text-neutral-500 shrink-0">
          {total} объявлений
          {geocodedApartments.length > 0 && (
            <span className="text-primary-400"> · {geocodedApartments.length} с точным адресом</span>
          )}
          {unknownCount > 0 && (
            <span className="text-neutral-600"> · {unknownCount} без зоны</span>
          )}
        </p>
      </div>

      {/* Map */}
      <div className="rounded-lg overflow-hidden border border-surface-border" style={{ height: "420px" }}>
        <LeafletMap
          center={BISHKEK_CENTER}
          zoom={12}
          groups={groups}
          globalAvgPrice={globalAvgPrice}
          onZoneClick={onZoneClick}
          geocodedApartments={geocodedApartments}
        />
      </div>

      {/* Heatmap legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-neutral-500">
        <span className="font-medium text-neutral-400">Ср. цена по зоне:</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#22c55e] shrink-0" />дешевле −15%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#2dd4bf] shrink-0" />средняя
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] shrink-0" />+15%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#f43f5e] shrink-0" />+30% и выше
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[#fbbf24] shrink-0" />без зоны
        </span>
      </div>
    </div>
  );
}
