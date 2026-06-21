"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { analyticsAPI } from "@/lib/api";

export default function SeasonalityChart() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["seasonality"],
    queryFn: analyticsAPI.getSeasonality,
    staleTime: 60 * 60 * 1000,
  });

  const points = data?.data ?? [];
  const maxPrice = points.length ? Math.max(...points.map((p) => p.avg_price)) : 1;

  return (
    <div className="glass rounded-lg p-6">
      <h2 className="text-xl font-semibold mb-1">Сезонность цен</h2>
      <p className="text-xs text-neutral-500 mb-5">
        Средняя цена аренды по месяцам года
      </p>

      {isLoading && (
        <div className="h-48 flex items-center justify-center text-neutral-500 text-sm">
          Загрузка...
        </div>
      )}
      {isError && (
        <div className="h-48 flex items-center justify-center text-neutral-500 text-sm">
          Нет данных
        </div>
      )}
      {!isLoading && !isError && points.length === 0 && (
        <div className="h-48 flex items-center justify-center text-neutral-500 text-sm">
          Данных за несколько месяцев пока недостаточно
        </div>
      )}
      {points.length > 0 && (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="month_label"
              tick={{ fontSize: 11, fill: "#737373" }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#737373" }}
              tickFormatter={(v: number) => `${Math.round(v / 1000)}к`}
              width={36}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(18,18,24,0.95)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              formatter={(value: number, _: string, entry: any) => [
                `${value.toLocaleString("ru-RU")} KGS (${entry?.payload?.count ?? 0} объявл.)`,
                "Средняя цена",
              ]}
            />
            <Bar dataKey="avg_price" radius={[4, 4, 0, 0]}>
              {points.map((p) => (
                <Cell
                  key={p.month}
                  fill={
                    p.avg_price >= maxPrice * 0.95
                      ? "#f87171"
                      : p.avg_price <= maxPrice * 0.88
                      ? "#34d399"
                      : "#7c3aed"
                  }
                  fillOpacity={0.8}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
      {points.length > 0 && (
        <p className="text-xs text-neutral-600 mt-2 text-right">
          🔴 — пик цен &nbsp;·&nbsp; 🟢 — минимум
        </p>
      )}
    </div>
  );
}
