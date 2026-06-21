"use client";

import { Suspense, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueries } from "@tanstack/react-query";
import {
  ArrowLeft,
  ExternalLink,
  GitCompare,
  Trash2,
  X,
} from "lucide-react";

import { apartmentsAPI, type Apartment } from "@/lib/api";
import { useCompare } from "@/lib/storage";

function parseIds(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function ComparePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const compare = useCompare();

  const idsFromUrl = useMemo(
    () => parseIds(searchParams.get("ids")),
    [searchParams],
  );

  // Если URL пуст — берём из localStorage. Если URL пришёл, синхронизируем
  // localStorage, чтобы шаринг ссылок работал.
  const ids = idsFromUrl.length > 0 ? idsFromUrl : compare.ids;

  useEffect(() => {
    if (idsFromUrl.length > 0) {
      const same =
        idsFromUrl.length === compare.ids.length &&
        idsFromUrl.every((id) => compare.ids.includes(id));
      if (!same) {
        // Синхронизируем localStorage с URL
        for (const id of compare.ids) {
          if (!idsFromUrl.includes(id)) compare.toggle(id);
        }
        for (const id of idsFromUrl) {
          if (!compare.ids.includes(id)) compare.toggle(id);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsFromUrl.join(",")]);

  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["apartment", id],
      queryFn: () => apartmentsAPI.getById(id),
      staleTime: 5 * 60 * 1000,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const apartments = queries
    .map((q) => q.data?.data)
    .filter((a): a is Apartment => !!a);

  const removeFromCompare = (id: number) => {
    compare.remove(id);
    const next = ids.filter((i) => i !== id);
    if (next.length > 0) {
      router.replace(`/compare?ids=${next.join(",")}`);
    } else {
      router.replace("/compare");
    }
  };

  return (
    <div className="min-h-screen mountain-bg">
      <div className="relative z-10 max-w-7xl mx-auto p-6 md:p-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/search"
              className="glass p-3 rounded-lg hover:bg-white/10 transition-all"
              title="К поиску"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="font-display text-3xl md:text-4xl font-bold text-neutral-100 inline-flex items-center gap-3">
                <GitCompare className="w-7 h-7 text-primary-400" />
                Сравнение
              </h1>
              <p className="text-sm text-neutral-400">
                До {compare.limit} квартир рядом друг с другом
              </p>
            </div>
          </div>
          {ids.length > 0 && (
            <button
              onClick={() => {
                compare.clear();
                router.replace("/compare");
              }}
              className="glass px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-white/10 text-neutral-300"
            >
              <Trash2 className="w-4 h-4" />
              Очистить
            </button>
          )}
        </header>

        {ids.length === 0 ? (
          <EmptyState />
        ) : isLoading ? (
          <div className="glass rounded-lg p-12 flex flex-col items-center gap-3 text-neutral-500">
            <div className="w-5 h-5 border-2 border-surface-overlay border-t-primary-500 rounded-full animate-spin" />
            <span className="text-sm">Загрузка...</span>
          </div>
        ) : apartments.length === 0 ? (
          <div className="glass rounded-lg p-12 text-center">
            <p className="text-neutral-300">Объявления недоступны.</p>
          </div>
        ) : (
          <CompareTable
            apartments={apartments}
            onRemove={removeFromCompare}
          />
        )}
      </div>
    </div>
  );
}

function CompareTable({
  apartments,
  onRemove,
}: {
  apartments: Apartment[];
  onRemove: (id: number) => void;
}) {
  // Подсветка лучшего значения в каждой строке (минимальная цена,
  // наибольшая площадь и т.д.).
  const minPrice = Math.min(...apartments.map((a) => a.price));
  const maxArea = Math.max(
    ...apartments.map((a) => a.total_area ?? -Infinity),
  );
  const minPpm = Math.min(
    ...apartments
      .map((a) => a.price_per_m2)
      .filter((v): v is number => Number.isFinite(v ?? NaN) && (v ?? 0) > 0),
  );

  type Row = {
    label: string;
    render: (apt: Apartment) => React.ReactNode;
    highlight?: (apt: Apartment) => boolean;
  };

  const rows: Row[] = [
    {
      label: "Фото",
      render: (a) =>
        a.image_url ? (
          <img
            src={a.image_url}
            alt={a.title}
            className="w-full h-28 object-cover rounded-md"
          />
        ) : (
          <div className="w-full h-28 bg-surface-raised rounded-md flex items-center justify-center text-neutral-600 text-xs">
            нет фото
          </div>
        ),
    },
    {
      label: "Цена",
      render: (a) => (
        <span className="font-numeric font-semibold text-primary-400">
          {a.price.toLocaleString("ru-RU")} KGS
        </span>
      ),
      highlight: (a) => a.price === minPrice,
    },
    {
      label: "Цена за м²",
      render: (a) =>
        a.price_per_m2
          ? `${a.price_per_m2.toLocaleString("ru-RU")} KGS/м²`
          : "—",
      highlight: (a) =>
        Number.isFinite(minPpm) && a.price_per_m2 === minPpm,
    },
    {
      label: "Комнаты",
      render: (a) =>
        a.rooms == null
          ? "—"
          : a.rooms === 0
            ? "Студия"
            : `${a.rooms}-комн.`,
    },
    {
      label: "Площадь",
      render: (a) => (a.total_area ? `${a.total_area} м²` : "—"),
      highlight: (a) =>
        Number.isFinite(maxArea) && a.total_area === maxArea,
    },
    {
      label: "Этаж",
      render: (a) => a.floor || "—",
    },
    {
      label: "Адрес",
      render: (a) => a.address || "—",
    },
    {
      label: "Ссылка",
      render: (a) => (
        <a
          href={a.link}
          target="_blank"
          rel="noreferrer"
          className="text-primary-400 hover:text-primary-300 inline-flex items-center gap-1 transition-colors"
        >
          {a.source}
          <ExternalLink className="w-3 h-3" />
        </a>
      ),
    },
  ];

  return (
    <div className="glass rounded-lg overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr>
            <th className="text-left text-xs uppercase tracking-wide text-neutral-500 px-4 py-3 align-bottom w-32">
              Параметр
            </th>
            {apartments.map((a) => (
              <th
                key={a.id}
                className="text-left px-4 py-3 align-bottom min-w-[220px] border-l border-surface-border"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <Link
                    href={`/apartments/${a.id}`}
                    className="text-sm font-medium line-clamp-2 hover:text-primary-400 transition-colors"
                  >
                    {a.title}
                  </Link>
                  <button
                    onClick={() => onRemove(a.id)}
                    title="Убрать из сравнения"
                    className="shrink-0 text-neutral-500 hover:text-red-300"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-surface-border">
              <td className="px-4 py-3 text-xs uppercase tracking-wide text-neutral-500 align-top">
                {row.label}
              </td>
              {apartments.map((a) => {
                const isBest = row.highlight?.(a) ?? false;
                return (
                  <td
                    key={a.id}
                    className={`px-4 py-3 text-sm align-top border-l border-surface-border ${
                      isBest ? "bg-status-up/5" : ""
                    }`}
                  >
                    {row.render(a)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="glass rounded-lg p-12 text-center">
      <GitCompare className="w-12 h-12 mx-auto mb-4 text-neutral-500" />
      <p className="text-lg text-neutral-200 mb-2">Нечего сравнивать</p>
      <p className="text-sm text-neutral-500 mb-5">
        Отметьте 2–4 квартиры значком сравнения на карточке.
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

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen mountain-bg flex items-center justify-center text-neutral-400">
          Загрузка...
        </div>
      }
    >
      <ComparePageInner />
    </Suspense>
  );
}
