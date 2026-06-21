"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Flame } from "lucide-react";
import { analyticsAPI } from "@/lib/api";

export default function TopDeals() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["top-deals"],
    queryFn: () => analyticsAPI.getTopDeals(8),
    staleTime: 10 * 60 * 1000,
  });

  const items = data?.data?.items ?? [];

  return (
    <div className="glass rounded-lg p-6">
      <div className="flex items-center gap-2 mb-1">
        <Flame className="w-5 h-5 text-orange-400" />
        <h2 className="text-xl font-semibold">Лучшие сделки</h2>
      </div>
      <p className="text-xs text-neutral-500 mb-5">
        Самая низкая цена за м² · без дублей и аномалий
      </p>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-surface-raised animate-pulse" />
          ))}
        </div>
      )}
      {isError && (
        <p className="text-neutral-500 text-sm py-4 text-center">Нет данных</p>
      )}
      {!isLoading && !isError && items.length === 0 && (
        <p className="text-neutral-500 text-sm py-4 text-center">
          Запустите парсер для получения данных
        </p>
      )}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((apt, i) => {
            const roomsLabel =
              apt.rooms === 0 ? "Студия" : apt.rooms ? `${apt.rooms}-комн.` : "—";
            return (
              <div
                key={apt.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-surface-raised hover:bg-surface-overlay transition-colors group"
              >
                <span className="text-sm font-bold text-neutral-600 w-5 shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/apartments/${apt.id}`}
                    className="text-sm text-neutral-200 hover:text-primary-400 transition-colors line-clamp-1"
                  >
                    {apt.title}
                  </Link>
                  <div className="flex gap-3 mt-0.5 text-xs text-neutral-500">
                    <span>{roomsLabel}</span>
                    {apt.total_area && <span>{apt.total_area} м²</span>}
                    {apt.address && (
                      <span className="truncate max-w-[140px]">{apt.address}</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-numeric text-sm font-bold text-primary-400">
                    {apt.price.toLocaleString("ru-RU")}
                    <span className="text-neutral-500 font-normal"> KGS</span>
                  </p>
                  {apt.price_per_m2 && (
                    <p className="text-xs text-green-400">
                      {Math.round(apt.price_per_m2).toLocaleString("ru-RU")}/м²
                    </p>
                  )}
                </div>
                <a
                  href={apt.link}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-neutral-600 hover:text-primary-400 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            );
          })}
        </div>
      )}
      <Link
        href="/search?sort=deal_asc"
        className="mt-4 block text-center text-xs text-primary-400 hover:text-primary-300 transition-colors"
      >
        Все выгодные предложения →
      </Link>
    </div>
  );
}
