"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { analyticsAPI, type ZoneTrendResult } from "@/lib/api";

const ZONE_COLORS: Record<string, string> = {
  center: "#a78bfa",
  south: "#34d399",
  east: "#60a5fa",
  west: "#fb923c",
  north: "#f472b6",
  microdistricts: "#facc15",
};

const ZONE_LABELS: Record<string, string> = {
  center: "Центр",
  south: "Юг",
  east: "Восток",
  west: "Запад",
  north: "Север",
  microdistricts: "Мкр.",
};

function mergeWeeks(data: ZoneTrendResult) {
  const weeksSet = new Set<string>();
  for (const zone of Object.values(data)) {
    for (const pt of zone.data) weeksSet.add(pt.week);
  }
  const weeks = Array.from(weeksSet).sort();
  return weeks.map((week) => {
    const row: Record<string, string | number | null> = {
      week: week.slice(0, 10),
    };
    for (const [zoneId, zone] of Object.entries(data)) {
      const pt = zone.data.find((p) => p.week === week);
      row[zoneId] = pt ? pt.avg_price : null;
    }
    return row;
  });
}

export default function ZonePriceTrendChart() {
  const [days, setDays] = useState(30);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["zone-price-trend", days],
    queryFn: () => analyticsAPI.getZonePriceTrend(days),
  });

  const chartData = data?.data ? mergeWeeks(data.data) : [];
  const zones = data?.data ? Object.keys(data.data) : [];

  return (
    <div className="glass rounded-lg p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-semibold">Динамика цен по зонам</h2>
        <div className="flex gap-2">
          {[30, 60, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                days === d
                  ? "bg-primary-500/20 text-primary-400 border border-primary-500/30"
                  : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {d} дн.
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="h-56 flex items-center justify-center text-neutral-500 text-sm">
          Загрузка...
        </div>
      )}
      {isError && (
        <div className="h-56 flex items-center justify-center text-neutral-500 text-sm">
          Нет данных
        </div>
      )}
      {!isLoading && !isError && chartData.length === 0 && (
        <div className="h-56 flex items-center justify-center text-neutral-500 text-sm">
          Недостаточно данных для отображения
        </div>
      )}
      {chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="week"
              tick={{ fontSize: 10, fill: "#737373" }}
              tickFormatter={(v: string) => v.slice(5)}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#737373" }}
              tickFormatter={(v: number) =>
                v >= 1000 ? `${Math.round(v / 1000)}к` : String(v)
              }
              width={40}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(18,18,24,0.95)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(value: number | null, name: string) => [
                value != null ? `${value.toLocaleString("ru-RU")} KGS` : "—",
                ZONE_LABELS[name] || name,
              ]}
              labelFormatter={(label: string) => `Неделя: ${label}`}
            />
            <Legend
              formatter={(value: string) => ZONE_LABELS[value] || value}
              wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
            />
            {zones.map((zoneId) => (
              <Line
                key={zoneId}
                type="monotone"
                dataKey={zoneId}
                stroke={ZONE_COLORS[zoneId] || "#6b7280"}
                dot={false}
                strokeWidth={2}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
