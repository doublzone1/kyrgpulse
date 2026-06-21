"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface PricePoint {
  price: number;
  recorded_at: string;
  change_pct: number | null;
}

interface Props {
  currentPrice: number;
  history: PricePoint[];
  loading?: boolean;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value?: number; payload?: { date: string; change_pct: number | null } }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const pct = payload[0]?.payload?.change_pct;
  return (
    <div className="glass rounded-lg p-3 text-sm shadow-dropdown min-w-[140px]">
      <p className="text-neutral-500 text-xs mb-1">{label}</p>
      <p className="font-numeric font-semibold text-primary-400">
        {payload[0]?.value?.toLocaleString("ru-RU")} KGS
      </p>
      {pct != null && (
        <p
          className={`text-xs mt-0.5 font-numeric ${
            pct < 0 ? "text-red-400" : "text-emerald-400"
          }`}
        >
          {pct > 0 ? "+" : ""}
          {pct.toFixed(1)}%
        </p>
      )}
    </div>
  );
}

export default function PriceHistoryChart({ currentPrice, history, loading }: Props) {
  if (loading) {
    return <div className="h-[160px] rounded-lg bg-surface-raised animate-pulse" />;
  }

  if (history.length === 0) {
    return (
      <div className="rounded-lg bg-surface-raised border border-surface-border p-4 flex items-center justify-between gap-4">
        <span className="text-sm text-neutral-500">Цена не менялась с момента первого парсинга</span>
        <span className="font-numeric font-semibold text-primary-400 shrink-0">
          {currentPrice.toLocaleString("ru-RU")} KGS
        </span>
      </div>
    );
  }

  const data = [
    ...history.map((h) => ({
      price: h.price,
      date: new Date(h.recorded_at).toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
      }),
      change_pct: h.change_pct,
    })),
    { price: currentPrice, date: "Сейчас", change_pct: null },
  ];

  const prices = data.map((d) => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const firstPrice = data[0].price;
  const totalChange = ((currentPrice - firstPrice) / firstPrice) * 100;
  const dropped = totalChange < 0;
  const lineColor = dropped ? "#f43f5e" : "#14b8a6";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500">{history.length} изм. цены</p>
        <span
          className={`font-numeric text-sm font-semibold flex items-center gap-1 ${
            dropped ? "text-red-400" : "text-emerald-400"
          }`}
        >
          {dropped ? (
            <TrendingDown className="w-3.5 h-3.5" />
          ) : (
            <TrendingUp className="w-3.5 h-3.5" />
          )}
          {totalChange > 0 ? "+" : ""}
          {totalChange.toFixed(1)}% за всё время
        </span>
      </div>

      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.05)"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#71717a", fontSize: 10 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#71717a", fontSize: 10 }}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}к`}
            domain={[minPrice * 0.92, maxPrice * 1.08]}
            width={32}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ stroke: "rgba(255,255,255,0.08)" }}
          />
          <ReferenceLine
            y={firstPrice}
            stroke="rgba(255,255,255,0.1)"
            strokeDasharray="4 4"
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke={lineColor}
            strokeWidth={2}
            dot={{ fill: lineColor, r: 3, strokeWidth: 0 }}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
