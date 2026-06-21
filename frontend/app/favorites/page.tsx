"use client";

import Link from "next/link";
import { useQueries } from "@tanstack/react-query";
import { ArrowLeft, Download, Star, Trash2 } from "lucide-react";

import ApartmentCard from "@/components/ApartmentCard";
import { apartmentsAPI, type Apartment } from "@/lib/api";
import { useFavorites } from "@/lib/storage";

function exportToCsv(items: Apartment[]) {
  const header = ["ID", "Название", "Цена (KGS)", "Комнат", "Площадь м²", "Этаж", "Адрес", "Источник", "Ссылка"];
  const rows = items.map((a) => [
    a.id,
    `"${(a.title ?? "").replace(/"/g, '""')}"`,
    a.price,
    a.rooms ?? "",
    a.total_area ?? "",
    a.floor ?? "",
    `"${(a.address ?? "").replace(/"/g, '""')}"`,
    a.source,
    a.link,
  ]);
  const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `kyrgpulse-favorites-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

export default function FavoritesPage() {
  const favorites = useFavorites();

  const queries = useQueries({
    queries: favorites.ids.map((id) => ({
      queryKey: ["apartment", id],
      queryFn: () => apartmentsAPI.getById(id),
      staleTime: 5 * 60 * 1000,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const items = queries
    .map((q) => q.data?.data)
    .filter((a): a is Apartment => !!a);

  // Удалённые с lalafo / отсутствующие в БД — оставляем в localStorage,
  // но не показываем (404 → q.data?.data === undefined).
  const missing = queries.filter((q) => q.isError).length;

  return (
    <div className="min-h-screen mountain-bg">
      <div className="relative z-10 max-w-7xl mx-auto p-6 md:p-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="glass p-3 rounded-lg hover:bg-white/10 transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="font-display text-3xl md:text-4xl font-bold text-neutral-100 inline-flex items-center gap-3">
                <Star className="w-7 h-7 text-accent-400" fill="currentColor" />
                Избранное
              </h1>
              <p className="text-sm text-neutral-400">
                Сохранено в этом браузере, без аккаунта.
              </p>
            </div>
          </div>
          {favorites.ids.length > 0 && (
            <div className="flex gap-2">
              {items.length > 0 && (
                <button
                  onClick={() => exportToCsv(items)}
                  className="glass px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-white/10 text-neutral-300"
                >
                  <Download className="w-4 h-4" />
                  Экспорт CSV
                </button>
              )}
              <button
                onClick={() => favorites.clear()}
                className="glass px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-white/10 text-neutral-300"
              >
                <Trash2 className="w-4 h-4" />
                Очистить всё
              </button>
            </div>
          )}
        </header>

        {favorites.ids.length === 0 ? (
          <EmptyState />
        ) : isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: Math.min(favorites.ids.length, 6) }).map((_, i) => (
              <div
                key={i}
                className="h-56 rounded-lg bg-surface-raised animate-pulse"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="glass rounded-lg p-12 text-center">
            <p className="text-neutral-300 mb-2">
              Все сохранённые квартиры удалены или недоступны.
            </p>
            <button
              onClick={() => favorites.clear()}
              className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
            >
              Очистить избранное
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-neutral-400 mb-4">
              {items.length} {items.length === 1 ? "квартира" : "квартир"}
              {missing > 0 && (
                <span className="text-neutral-500"> · {missing} недоступно</span>
              )}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {items.map((apt) => (
                <ApartmentCard key={apt.id} apartment={apt} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="glass rounded-lg p-12 text-center">
      <Star className="w-12 h-12 mx-auto mb-4 text-neutral-500" />
      <p className="text-lg text-neutral-200 mb-2">
        В избранном пока пусто
      </p>
      <p className="text-sm text-neutral-500 mb-5">
        Нажмите звёздочку на карточке квартиры, чтобы сохранить её сюда.
      </p>
      <Link
        href="/search"
        className="inline-block px-5 py-2 rounded-md bg-primary-600 hover:bg-primary-500 text-surface-page text-sm font-medium transition-colors"
      >
        Перейти к поиску
      </Link>
    </div>
  );
}
