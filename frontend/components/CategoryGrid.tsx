"use client";

import Link from "next/link";

import type { ApartmentSearchParams } from "@/lib/api";

export interface Category {
  id: string;
  label: string;
  description?: string;
  params: ApartmentSearchParams;
}

const CATEGORIES: Category[] = [
  // По комнатам
  { id: "studio", label: "Студии", params: { rooms: 0 } },
  { id: "1k", label: "1-комнатные", params: { rooms: 1 } },
  { id: "2k", label: "2-комнатные", params: { rooms: 2 } },
  { id: "3k", label: "3-комнатные", params: { rooms: 3 } },

  // По районам
  { id: "center", label: "Центр", params: { zone: "center" } },
  { id: "south", label: "Юг", params: { zone: "south" } },
  { id: "north", label: "Север", params: { zone: "north" } },
  { id: "west", label: "Запад", params: { zone: "west" } },
  { id: "east", label: "Восток", params: { zone: "east" } },
  { id: "mkr", label: "Микрорайоны", params: { zone: "microdistricts" } },

  // По цене
  {
    id: "cheap",
    label: "До 25 000 KGS",
    description: "Бюджетный сегмент",
    params: { max_price: 25000, sort: "price_asc" },
  },
  {
    id: "mid",
    label: "25–50 000 KGS",
    description: "Средний сегмент",
    params: { min_price: 25000, max_price: 50000, sort: "price_asc" },
  },
  {
    id: "premium",
    label: "От 50 000 KGS",
    description: "Дорогой сегмент",
    params: { min_price: 50000, sort: "price_desc" },
  },
];

function buildHref(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `/search?${qs}` : "/search";
}

export default function CategoryGrid() {
  const groups: Array<{ title: string; ids: string[] }> = [
    { title: "По типу", ids: ["studio", "1k", "2k", "3k"] },
    { title: "По району", ids: ["center", "south", "north", "west", "east", "mkr"] },
    { title: "По цене", ids: ["cheap", "mid", "premium"] },
  ];

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <div key={group.title}>
          <h3 className="text-sm uppercase tracking-wider text-neutral-500 mb-3">
            {group.title}
          </h3>
          <div className="flex flex-wrap gap-3">
            {group.ids.map((id) => {
              const cat = CATEGORIES.find((c) => c.id === id);
              if (!cat) return null;
              return (
                <Link
                  key={cat.id}
                  href={buildHref(cat.params as Record<string, unknown>)}
                  className="glass px-5 py-3 rounded-lg text-sm hover:bg-white/10 transition-all"
                >
                  <span className="font-medium text-white">{cat.label}</span>
                  {cat.description && (
                    <span className="block text-xs text-neutral-500 mt-1">
                      {cat.description}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
