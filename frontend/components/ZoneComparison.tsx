"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { analyticsAPI } from "@/lib/api";

interface ZoneData {
  zone_id: string;
  label: string;
  count: number;
  avg_price: number | null;
  min_price: number | null;
  max_price: number | null;
  avg_price_per_m2: number | null;
}

const ZONE_COLORS: Record<string, string> = {
  center: "#f59e0b",
  south: "#14b8a6",
  east: "#3b82f6",
  west: "#8b5cf6",
  north: "#f43f5e",
  microdistricts: "#22c55e",
};

export default function ZoneComparison() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["zones-comparison"],
    queryFn: analyticsAPI.getZonesComparison,
    staleTime: 5 * 60 * 1000,
  });

  const zones: ZoneData[] = (data?.data?.zones ?? []).filter(
    (z: ZoneData) => z.avg_price != null && z.count > 0,
  );

  const maxAvg = zones.length > 0 ? Math.max(...zones.map((z) => z.avg_price!)) : 0;
  const minAvg = zones.length > 0 ? Math.min(...zones.map((z) => z.avg_price!)) : 0;

  const sorted = [...zones].sort((a, b) => (a.avg_price ?? 0) - (b.avg_price ?? 0));

  return (
    <div className="glass rounded-lg p-6 md:p-8">
      <div className="flex items-center gap-2 mb-6">
        <MapPin className="w-5 h-5 text-primary-400" />
        <div>
          <h2 className="font-display text-xl font-semibold">Сравнение районов</h2>
          <p className="text-xs text-neutral-500 mt-0.5">Средняя цена аренды по зонам Бишкека</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-14 bg-surface-raised rounded-lg animate-pulse" />
          ))}
        </div>
      ) : isError || sorted.length === 0 ? (
        <p className="text-sm text-neutral-500 py-4">
          Нет данных по районам. Запустите парсер.
        </p>
      ) : (
        <div className="space-y-2">
          {sorted.map((zone, idx) => {
            const color = ZONE_COLORS[zone.zone_id] ?? "#14b8a6";
            const barPct =
              maxAvg > minAvg
                ? 35 + ((zone.avg_price! - minAvg) / (maxAvg - minAvg)) * 55
                : 60;
            const isCheapest = idx === 0;
            const isPriciest = idx === sorted.length - 1;

            return (
              <Link
                key={zone.zone_id}
                href={`/search?zone=${zone.zone_id}`}
                className="flex items-center gap-3 p-3 rounded-lg bg-surface-raised hover:bg-surface-overlay transition-colors group"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 mb-1.5">
                    <span className="text-sm font-medium text-neutral-200 flex items-center gap-1.5">
                      {zone.label}
                      {isCheapest && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">
                          дешевле
                        </span>
                      )}
                      {isPriciest && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium">
                          дороже
                        </span>
                      )}
                    </span>
                    <span className="font-numeric text-sm font-semibold text-primary-400 shrink-0">
                      {zone.avg_price!.toLocaleString("ru-RU")} KGS
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-surface-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${barPct}%`, background: color, opacity: 0.65 }}
                      />
                    </div>
                    <span className="text-xs text-neutral-500 shrink-0">{zone.count} объявл.</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {sorted.length > 1 && (
        <p className="mt-4 text-xs text-neutral-600">
          Нажмите на район — покажем все объявления в нём
        </p>
      )}
    </div>
  );
}
