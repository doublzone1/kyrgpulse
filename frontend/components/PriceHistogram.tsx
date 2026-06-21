"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { Apartment } from "@/lib/api";

interface Props {
  apartments: Apartment[];
  bins?: number;
}

interface Bucket {
  label: string;
  count: number;
  from: number;
  to: number;
}

function formatShort(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

interface TooltipPayload {
  payload?: Bucket;
}

interface TooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  if (!b) return null;
  return (
    <div className="glass p-3 rounded-lg text-xs shadow-dropdown min-w-[160px]">
      <p className="text-neutral-400 mb-1">
        {b.from.toLocaleString("ru-RU")} – {b.to.toLocaleString("ru-RU")} KGS
      </p>
      <p className="font-numeric font-semibold text-primary-400">{b.count} объявл.</p>
    </div>
  );
}

export default function PriceHistogram({ apartments, bins = 12 }: Props) {
  const { buckets, stats } = useMemo(() => {
    const prices = apartments
      .map((a) => a.price)
      .filter((p): p is number => Number.isFinite(p) && p > 0)
      .sort((a, b) => a - b);

    if (prices.length < 2) {
      return {
        buckets: [] as Bucket[],
        stats: null as null | { min: number; max: number; median: number; avg: number },
      };
    }

    const min = prices[0];
    const max = prices[prices.length - 1];
    const median = prices[Math.floor(prices.length / 2)];
    const avg = Math.round(prices.reduce((s, v) => s + v, 0) / prices.length);

    if (max === min) {
      return {
        buckets: [{ label: formatShort(min), from: min, to: max, count: prices.length }],
        stats: { min, max, median, avg },
      };
    }

    const step = (max - min) / bins;
    const out: Bucket[] = [];
    for (let i = 0; i < bins; i++) {
      const from = min + step * i;
      const to = i === bins - 1 ? max : min + step * (i + 1);
      out.push({ label: formatShort(Math.round(from)), from: Math.round(from), to: Math.round(to), count: 0 });
    }
    for (const price of prices) {
      let idx = Math.floor((price - min) / step);
      if (idx >= bins) idx = bins - 1;
      out[idx].count += 1;
    }

    return { buckets: out, stats: { min, max, median, avg } };
  }, [apartments, bins]);

  if (!stats) {
    return (
      <div className="glass rounded-lg p-6 text-sm text-neutral-500">
        Слишком мало данных для распределения цен.
      </div>
    );
  }

  return (
    <div className="glass rounded-lg p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold text-neutral-200">Распределение цен</h3>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
          <span>мин: <span className="font-numeric text-neutral-300">{stats.min.toLocaleString("ru-RU")}</span></span>
          <span>медиана: <span className="font-numeric text-neutral-300">{stats.median.toLocaleString("ru-RU")}</span></span>
          <span>среднее: <span className="font-numeric text-neutral-300">{stats.avg.toLocaleString("ru-RU")}</span></span>
          <span>макс: <span className="font-numeric text-neutral-300">{stats.max.toLocaleString("ru-RU")}</span></span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={buckets} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#71717a", fontSize: 11 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#71717a", fontSize: 11 }}
            width={28}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(20,184,166,0.07)" }} />
          <Bar dataKey="count" fill="#14b8a6" fillOpacity={0.85} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
