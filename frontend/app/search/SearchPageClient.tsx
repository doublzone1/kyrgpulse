"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  BarChart3,
  Download,
  GitCompare,
  RefreshCw,
  SearchX,
  Send,
  Star,
} from "lucide-react";

import ApartmentCard from "@/components/ApartmentCard";
import Pagination from "@/components/Pagination";
import PriceHistogram from "@/components/PriceHistogram";
import PulseIndicator from "@/components/PulseIndicator";
import RecentlyViewed from "@/components/RecentlyViewed";
import SavedFilters from "@/components/SavedFilters";
import SearchFilters from "@/components/SearchFilters";
import {
  apartmentsAPI,
  getApiErrorMessage,
  getExportUrl,
  telegramAPI,
  type ApartmentListResponse,
  type ApartmentSearchParams,
  type SortBy,
} from "@/lib/api";
import { buildPriceBenchmark, getPriceVerdict } from "@/lib/priceBenchmark";
import { saveLastFilters, useCompare, useFavorites } from "@/lib/storage";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="h-[420px] flex items-center justify-center text-neutral-500 bg-surface-card rounded-lg border border-surface-border">
      Загрузка карты...
    </div>
  ),
});

const NUMERIC_KEYS = [
  "min_price",
  "max_price",
  "rooms",
  "min_area",
  "max_area",
  "floor",
  "page",
  "limit",
] as const;

const SORT_VALUES: SortBy[] = [
  "date_desc",
  "price_asc",
  "price_desc",
  "area_asc",
  "area_desc",
];

function parseParams(sp: URLSearchParams): ApartmentSearchParams {
  const out: ApartmentSearchParams = {};
  const q = sp.get("q");
  if (q) out.q = q;
  const zone = sp.get("zone");
  if (zone) out.zone = zone;
  for (const key of NUMERIC_KEYS) {
    const raw = sp.get(key);
    if (raw == null || raw === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n)) (out as Record<string, unknown>)[key] = n;
  }
  const sort = sp.get("sort");
  if (sort && (SORT_VALUES as string[]).includes(sort)) {
    out.sort = sort as SortBy;
  }
  return out;
}

function buildFilterLabel(filters: ApartmentSearchParams): string {
  const parts: string[] = [];
  if (filters.rooms !== undefined) {
    parts.push(filters.rooms === 0 ? "Студия" : `${filters.rooms} комн.`);
  }
  if (filters.max_price)
    parts.push(`до ${filters.max_price.toLocaleString("ru-RU")} KGS`);
  else if (filters.min_price)
    parts.push(`от ${filters.min_price.toLocaleString("ru-RU")} KGS`);
  if (filters.zone) parts.push(`зона: ${filters.zone}`);
  return parts.join(", ") || "все квартиры";
}

function buildQueryString(params: ApartmentSearchParams): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    sp.set(key, String(value));
  }
  return sp.toString();
}

export default function SearchPageClient({
  initialData,
}: {
  initialData: ApartmentListResponse | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const favorites = useFavorites();
  const compare = useCompare();
  const [isSubscribing, setIsSubscribing] = useState(false);

  const filters = useMemo<ApartmentSearchParams>(() => {
    const parsed = parseParams(new URLSearchParams(searchParams.toString()));
    return { sort: "date_desc", page: 1, limit: 24, ...parsed };
  }, [searchParams]);

  useEffect(() => {
    saveLastFilters(filters);
  }, [filters]);

  const updateFilters = useCallback(
    (next: ApartmentSearchParams) => {
      const qs = buildQueryString({ ...next, limit: next.limit ?? 24 });
      router.replace(qs ? `/search?${qs}` : "/search", { scroll: false });
    },
    [router],
  );

  const exportUrl = useMemo(() => {
    const { q, zone, min_price, max_price, rooms, min_area, max_area, floor, has_area, sort } =
      filters;
    return getExportUrl({ q, zone, min_price, max_price, rooms, min_area, max_area, floor, has_area, sort });
  }, [filters]);

  const handleTelegramSubscribe = useCallback(async () => {
    setIsSubscribing(true);
    try {
      const resp = await telegramAPI.generateLink(filters, buildFilterLabel(filters));
      window.open(resp.data.url, "_blank", "noopener,noreferrer");
    } catch {
      // bot not configured — silently skip
    } finally {
      setIsSubscribing(false);
    }
  }, [filters]);

  const goToPage = useCallback(
    (page: number) => {
      updateFilters({ ...filters, page });
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [filters, updateFilters],
  );

  const { data: zonesRes } = useQuery({
    queryKey: ["zones"],
    queryFn: apartmentsAPI.getZones,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: apartmentsRes,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["apartments-search", filters],
    queryFn: () => apartmentsAPI.search(filters),
    placeholderData: (previous) => previous,
  });

  const analyticsFilters = useMemo<ApartmentSearchParams>(
    () => ({ ...filters, limit: 200, page: 1 }),
    [filters],
  );
  const { data: analyticsRes } = useQuery({
    queryKey: ["apartments-search-analytics", analyticsFilters],
    queryFn: () => apartmentsAPI.search(analyticsFilters),
    enabled: !isError,
    placeholderData: (previous) => previous,
    staleTime: 30 * 1000,
  });

  const items = apartmentsRes?.data?.items ?? initialData?.items ?? [];
  const total = apartmentsRes?.data?.total ?? initialData?.total ?? 0;
  const page = apartmentsRes?.data?.page ?? initialData?.page ?? filters.page ?? 1;
  const pages = apartmentsRes?.data?.pages ?? initialData?.pages ?? 1;
  const analyticsItems = analyticsRes?.data?.items ?? initialData?.items ?? items;

  // Don't show skeleton when server pre-fetched data is available
  const showSkeleton = isLoading && initialData === null;

  const priceBenchmark = useMemo(
    () => buildPriceBenchmark(analyticsItems),
    [analyticsItems],
  );

  return (
    <div className="min-h-screen mountain-bg">
      <div className="relative z-10 max-w-7xl mx-auto p-6 md:p-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="glass p-3 rounded-lg hover:bg-white/10 transition-all"
              title="На главную"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="font-display text-3xl md:text-4xl font-black neon-text">
                Поиск квартир
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <PulseIndicator label="lalafo · live" />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {favorites.ids.length > 0 && (
              <Link
                href="/favorites"
                className="glass px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-white/10"
              >
                <Star className="w-4 h-4 text-amber-300" />
                Избранное
                <span className="text-neutral-400">{favorites.ids.length}</span>
              </Link>
            )}
            {compare.ids.length > 0 && (
              <Link
                href={`/compare?ids=${compare.ids.join(",")}`}
                className="glass px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-white/10"
              >
                <GitCompare className="w-4 h-4 text-primary-400" />
                Сравнить
                <span className="text-neutral-400">{compare.ids.length}</span>
              </Link>
            )}
            <Link
              href="/dashboard"
              className="glass px-5 py-3 rounded-lg text-sm flex items-center gap-2 hover:bg-white/10 transition-all"
            >
              <BarChart3 className="w-4 h-4" />
              Аналитика
            </Link>
            <a
              href={exportUrl}
              download
              className="glass px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-white/10 transition-all"
              title="Скачать результаты поиска в CSV"
            >
              <Download className="w-4 h-4 text-neutral-400" />
              CSV
            </a>
            <button
              onClick={handleTelegramSubscribe}
              disabled={isSubscribing}
              className="glass px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-white/10 transition-all disabled:opacity-50"
              title="Получать уведомления о новых объявлениях в Telegram"
            >
              <Send className="w-4 h-4 text-sky-400" />
              {isSubscribing ? "..." : "Telegram"}
            </button>
          </div>
        </header>

        <SearchFilters
          value={filters}
          onChange={updateFilters}
          zones={zonesRes?.data?.zones}
        />

        <SavedFilters current={filters} onLoad={updateFilters} />

        <RecentlyViewed />

        {!isError && analyticsItems.length > 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <PriceHistogram apartments={analyticsItems} />
            <div className="glass rounded-lg p-6">
              <h3 className="text-base font-semibold mb-3">Карта зон</h3>
              <MapView
                apartments={analyticsItems}
                onZoneClick={(zoneId) =>
                  updateFilters({ ...filters, zone: zoneId, page: 1 })
                }
              />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-8 mb-4">
          <p className="text-sm text-neutral-400">
            {showSkeleton ? (
              "Загрузка..."
            ) : isError ? (
              <span className="text-status-down">Ошибка запроса</span>
            ) : (
              <>
                Найдено:{" "}
                <span className="font-numeric text-white font-semibold">
                  {String(total).padStart(4, "0")}
                </span>
                {pages > 1 && (
                  <span className="text-neutral-500 font-numeric">
                    {" "}
                    · стр. {page} из {pages}
                  </span>
                )}
              </>
            )}
          </p>
          {isFetching && !isLoading && (
            <span className="text-xs text-neutral-500 flex items-center gap-2">
              <RefreshCw className="w-3 h-3 animate-spin" />
              обновление
            </span>
          )}
        </div>

        {isError ? (
          <div className="glass rounded-lg p-12 text-center">
            <SearchX className="w-12 h-12 mx-auto mb-4 text-neutral-500" />
            <p className="text-lg text-neutral-200 mb-2">
              Не удалось загрузить объявления
            </p>
            <p className="text-sm text-neutral-500 mb-5">
              {getApiErrorMessage(error)}
            </p>
            <button
              onClick={() => refetch()}
              className="px-5 py-2 rounded-md bg-primary-600 hover:bg-primary-500 text-surface-page text-sm font-medium transition-colors"
            >
              Повторить
            </button>
          </div>
        ) : showSkeleton ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-56 rounded-lg bg-surface-raised animate-pulse"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="glass rounded-lg p-12 text-center">
            <SearchX className="w-12 h-12 mx-auto mb-4 text-neutral-500" />
            <p className="text-lg text-neutral-200 mb-2">
              По вашему запросу ничего не найдено
            </p>
            <p className="text-sm text-neutral-500">
              Попробуйте смягчить фильтры или сбросить их.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {items.map((apartment) => (
                <ApartmentCard
                  key={apartment.id}
                  apartment={apartment}
                  priceVerdict={getPriceVerdict(apartment, priceBenchmark)}
                />
              ))}
            </div>
            <Pagination page={page} pages={pages} onPageChange={goToPage} />
          </>
        )}
      </div>
    </div>
  );
}
