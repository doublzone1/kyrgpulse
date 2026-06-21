"use client";

import { motion } from "framer-motion";
import { AreaChart, Building2, Database, TrendingUp } from "lucide-react";

interface Stats {
  total_apartments: number;
  average_price: number;
  average_area: number;
  converted_prices?: { KGS: number; USD: number; EUR: number; RUB: number };
  last_update?: string;
  rates_warning?: string | null;
}

interface Props {
  stats?: Stats;
  loading?: boolean;
  error?: boolean;
}

export default function StatsCards({ stats, loading, error }: Props) {
  const cards = [
    {
      icon: Building2,
      label: "Всего объявлений",
      value: stats?.total_apartments?.toLocaleString("ru-RU") ?? "—",
      subvalue: undefined as string | undefined,
      iconColor: "text-primary-400",
      iconBg: "bg-primary-500/10",
    },
    {
      icon: TrendingUp,
      label: "Средняя цена",
      value: stats?.average_price
        ? `${stats.average_price.toLocaleString("ru-RU")} KGS`
        : "—",
      subvalue: stats?.rates_warning
        ? "курс приблизительный"
        : stats?.converted_prices?.USD
        ? `≈ ${stats.converted_prices.USD.toLocaleString("ru-RU")} USD`
        : undefined,
      iconColor: "text-accent-500",
      iconBg: "bg-accent-500/10",
    },
    {
      icon: AreaChart,
      label: "Средняя площадь",
      value: stats?.average_area ? `${stats.average_area.toFixed(1)} м²` : "—",
      subvalue: undefined as string | undefined,
      iconColor: "text-primary-400",
      iconBg: "bg-primary-500/10",
    },
    {
      icon: Database,
      label: "Источник данных",
      value: "lalafo.kg",
      subvalue: stats?.last_update ?? "после запуска парсера",
      iconColor: "text-neutral-400",
      iconBg: "bg-surface-raised",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
      {cards.map((card, index) => (
        <motion.div
          key={card.label}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.08, duration: 0.3 }}
          className="glass rounded-lg p-5 md:p-6"
        >
          {/* Icon */}
          <div
            className={`w-9 h-9 rounded-md flex items-center justify-center mb-4 ${card.iconBg}`}
          >
            <card.icon className={`w-4 h-4 ${card.iconColor}`} />
          </div>

          {/* Label */}
          <p className="text-xs text-neutral-500 uppercase tracking-wide mb-2 leading-none">
            {card.label}
          </p>

          {/* Value area */}
          {error ? (
            <p className="text-sm text-status-down mt-1">Ошибка загрузки</p>
          ) : loading ? (
            <div className="space-y-2 mt-1">
              <div className="h-7 w-28 bg-surface-raised rounded animate-pulse" />
              <div className="h-3.5 w-20 bg-surface-raised rounded animate-pulse opacity-50" />
            </div>
          ) : (
            <>
              <p className="font-numeric text-xl md:text-2xl font-semibold text-neutral-100 leading-tight">
                {card.value}
              </p>
              {card.subvalue && (
                <p className="text-xs text-primary-400 mt-1.5 leading-none">
                  {card.subvalue}
                </p>
              )}
            </>
          )}
        </motion.div>
      ))}
    </div>
  );
}
