"use client";

import Link from "next/link";
import { Clock, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { apartmentsAPI, type Apartment } from "@/lib/api";
import { useRecentlyViewed } from "@/lib/useRecentlyViewed";

export default function RecentlyViewed() {
  const { ids, clear } = useRecentlyViewed();

  const { data } = useQuery({
    queryKey: ["recently-viewed", ids.slice(0, 10)],
    queryFn: async () => {
      if (ids.length === 0) return [];
      const results = await Promise.all(
        ids.slice(0, 10).map((id) =>
          apartmentsAPI.getById(id).catch(() => null),
        ),
      );
      return results
        .filter(Boolean)
        .map((r) => r!.data)
        .filter(Boolean) as Apartment[];
    },
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const items = data ?? [];
  if (ids.length === 0 || items.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <p className="flex items-center gap-2 text-sm font-medium text-neutral-400">
          <Clock className="w-4 h-4" />
          Недавно смотрели
        </p>
        <button
          onClick={clear}
          className="text-xs text-neutral-600 hover:text-neutral-400 flex items-center gap-1 transition-colors"
        >
          <X className="w-3 h-3" />
          Очистить
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
        {items.map((apt) => (
          <Link
            key={apt.id}
            href={`/apartments/${apt.id}`}
            className="shrink-0 glass rounded-lg p-3 w-48 hover:bg-white/5 transition-colors"
          >
            {apt.image_url && (
              <div className="w-full h-24 rounded-md overflow-hidden mb-2 bg-surface-raised">
                <img
                  src={apt.image_url}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}
            <p className="text-xs text-neutral-300 line-clamp-2 leading-relaxed">
              {apt.title}
            </p>
            <p className="font-numeric text-sm font-bold text-primary-400 mt-1">
              {apt.price.toLocaleString("ru-RU")} KGS
            </p>
            {apt.rooms != null && (
              <p className="text-xs text-neutral-500 mt-0.5">
                {apt.rooms === 0 ? "Студия" : `${apt.rooms}-комн.`}
                {apt.total_area ? ` · ${apt.total_area} м²` : ""}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
