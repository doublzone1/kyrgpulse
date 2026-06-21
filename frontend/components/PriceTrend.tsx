"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingDown, TrendingUp } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { analyticsAPI, type PriceTrendPoint } from "@/lib/api";

const PERIOD_OPTIONS = [
  { label: "14 дн.", days: 14 },
  { label: "30 дн.", days: 30 },
  { label: "90 дн.", days: 90 },
];

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value?: number; payload?: PriceTrendPoint }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  return (
    <div className="glass rounded-lg p-3 text-sm shadow-dropdown min-w-[140px]">
      <p className="text-neutral-500 text-xs mb-1">{label}</p>
      <p className="font-numeric font-semibold text-primary-400">
        {payload[0]?.value?.toLocaleString("ru-RU")} KGS
      </p>
      <p className="text-neutral-600 text-xs mt-0.5">{point?.count} объявл.</p>
    </div>
  );
}

function TrendSkeleton() {
  return (
    <div className="h-[200px] flex flex-col justify-end px-4">
      <div className="flex items-end gap-2 h-[160px]">
        {[40, 55, 48, 70, 62, 75, 65, 80, 72, 68, 78, 85, 72, 80].map((h, i) => (
          <div
            key={i}
            className="flex-1 bg-surface-raised rounded-t animate-pulse"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function PriceTrend() {
  const [days, setDays] = useState(30);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["price-trend", days],
    queryFn: () => analyticsAPI.getTrend({ days }),
    staleTime: 5 * 60 * 1000,
  });

  const trend = data?.data?.trend ?? [];

  const firstPoint = trend.find((p) => p.count > 0);
  const lastPoint = trend.length > 0 ? trend[trend.length - 1] : undefined;
  const change =
    firstPoint && lastPoint && firstPoint !== lastPoint
      ? ((lastPoint.avg_price - firstPoint.avg_price) / firstPoint.avg_price) * 100
      : null;

  const formatted = trend.map((p) => ({
    ...p,
    label: new Date(p.date).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
    }),
  }));

  return (
    <div className="glass rounded-lg p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="font-display text-xl font-semibold text-neutral-100">
            Динамика цен
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Средняя цена объявления по дням, KGS
          </p>
        </div>

        <div className="flex items-center gap-3">
          {change != null && (
            <span
              className={`font-numeric text-sm font-semibold flex items-center gap-1 ${
                change >= 0 ? "text-status-up" : "text-status-down"
              }`}
            >
              {change >= 0 ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              {change >= 0 ? "+" : ""}
              {change.toFixed(1)}%
            </span>
          )}
          <div className="flex gap-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.days}
                onClick={() => setDays(opt.days)}
                className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                  days === opt.days
                    ? "bg-primary-500/15 text-primary-400 border border-primary-500/25"
                    : "bg-surface-raised text-neutral-400 border border-transparent hover:text-neutral-200 hover:bg-surface-overlay"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <TrendSkeleton />
      ) : isError || trend.length < 2 ? (
        <div className="h-[200px] flex items-center justify-center text-sm text-neutral-500">
          {isError
            ? "Не удалось загрузить данные"
            : "Недостаточно данных за выбранный период"}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={formatted} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.05)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#71717a", fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}к`}
              width={36}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }}
            />
            <Line
              type="monotone"
              dataKey="avg_price"
              stroke="#14b8a6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "#14b8a6", strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
