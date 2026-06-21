"use client";

import { useQuery } from "@tanstack/react-query";
import { analyticsAPI, type AffordabilityItem } from "@/lib/api";

function grade(ratio: number): { label: string; color: string } {
  if (ratio <= 0.5) return { label: "Доступно", color: "text-green-400" };
  if (ratio <= 0.8) return { label: "Умеренно", color: "text-yellow-400" };
  if (ratio <= 1.0) return { label: "Дорого", color: "text-orange-400" };
  return { label: "Очень дорого", color: "text-red-400" };
}

function BarRow({ item }: { item: AffordabilityItem }) {
  const pct = Math.min(100, Math.round(item.rent_to_income * 100));
  const { label, color } = grade(item.rent_to_income);
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="w-16 text-xs text-neutral-400 shrink-0">{item.label}</span>
      <div className="flex-1 bg-surface-raised rounded-full h-2 overflow-hidden">
        <div
          className="h-2 rounded-full bg-primary-500/70 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-semibold w-20 text-right ${color}`}>
        {pct}% ({label})
      </span>
    </div>
  );
}

export default function AffordabilityWidget() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["affordability"],
    queryFn: analyticsAPI.getAffordability,
    staleTime: 5 * 60 * 1000,
  });

  const rows = data?.data?.affordability ?? [];
  const salary = data?.data?.avg_salary;

  return (
    <div className="glass rounded-lg p-6">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-xl font-semibold">Индекс доступности</h2>
        {salary && (
          <span className="text-xs text-neutral-500">
            ср. зарплата {salary.toLocaleString("ru-RU")} KGS
          </span>
        )}
      </div>
      <p className="text-xs text-neutral-500 mb-4">
        Доля дохода, которую занимает аренда (чем меньше — тем лучше)
      </p>

      {isLoading && (
        <div className="text-neutral-500 text-sm py-6 text-center">Загрузка...</div>
      )}
      {isError && (
        <div className="text-neutral-500 text-sm py-6 text-center">Нет данных</div>
      )}
      {!isLoading && !isError && rows.map((item) => (
        <BarRow key={item.zone_id} item={item} />
      ))}
    </div>
  );
}
