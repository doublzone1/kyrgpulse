"use client";

import { BarChart2 } from "lucide-react";
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

interface DataPoint {
  rooms: number | null;
  avg_price: number;
  count: number;
}

interface TooltipPayload {
  value?: number;
  payload?: DataPoint;
}

interface TooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
}

// Design-system chart palette — chart.1 through chart.5
const CHART_COLORS = ["#14b8a6", "#f59e0b", "#3b82f6", "#8b5cf6", "#f43f5e"];

const CustomTooltip = ({ active, payload }: TooltipProps) => {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;

  return (
    <div className="glass rounded-lg p-3 text-sm shadow-dropdown min-w-[140px]">
      <p className="text-neutral-400 text-xs mb-1.5">
        {point?.rooms === 0 ? "Студия" : point?.rooms != null ? `${point.rooms}-комн.` : "Нет данных"}
      </p>
      <p className="font-numeric font-semibold text-primary-400 text-base">
        {payload[0]?.value?.toLocaleString("ru-RU")} KGS
      </p>
      <p className="text-neutral-500 text-xs mt-1">{point?.count} объявлений</p>
    </div>
  );
};

function ChartPlaceholder({
  icon,
  message,
  hint,
}: {
  icon?: React.ReactNode;
  message: string;
  hint?: string;
}) {
  return (
    <div className="h-[280px] flex flex-col items-center justify-center gap-3 text-center">
      {icon ?? <BarChart2 className="w-8 h-8 text-neutral-700" />}
      <p className="text-sm text-neutral-400">{message}</p>
      {hint && <p className="text-xs text-neutral-600">{hint}</p>}
    </div>
  );
}

function ChartSkeleton() {
  const heights = [55, 82, 38, 70, 48];
  return (
    <div className="h-[280px] flex flex-col justify-end px-4">
      <div className="flex items-end gap-4 h-[220px]">
        {heights.map((h, i) => (
          <div
            key={i}
            className="flex-1 bg-surface-raised rounded-t animate-pulse"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="h-8 border-t border-surface-border mt-1 flex items-center gap-4 px-1">
        {heights.map((_, i) => (
          <div
            key={i}
            className="flex-1 h-2.5 bg-surface-raised rounded animate-pulse opacity-50"
          />
        ))}
      </div>
    </div>
  );
}

export default function PriceChart({
  data,
  loading,
  error,
}: {
  data: DataPoint[];
  loading?: boolean;
  error?: boolean;
}) {
  if (error) {
    return (
      <ChartPlaceholder
        message="Не удалось загрузить распределение цен"
        hint="Проверьте подключение к API"
      />
    );
  }

  if (loading) {
    return <ChartSkeleton />;
  }

  if (!data || data.length === 0) {
    return (
      <ChartPlaceholder
        message="Данных пока нет"
        hint="Запусти парсер, чтобы собрать объявления"
      />
    );
  }

  const formatted = data.map((point) => ({
    ...point,
    name:
      point.rooms === 0
        ? "Студия"
        : point.rooms === null
          ? "Н/Д"
          : `${point.rooms}-комн.`,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={formatted} margin={{ top: 8, right: 4, left: 4, bottom: 4 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(255,255,255,0.05)"
          vertical={false}
        />
        <XAxis
          dataKey="name"
          axisLine={false}
          tickLine={false}
          tick={{ fill: "#71717a", fontSize: 12 }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          tick={{ fill: "#71717a", fontSize: 11 }}
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}к`}
          width={36}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <Bar dataKey="avg_price" radius={[6, 6, 0, 0]} maxBarSize={56}>
          {formatted.map((_, index) => (
            <Cell
              key={index}
              fill={CHART_COLORS[index % CHART_COLORS.length]}
              fillOpacity={0.85}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
