"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Layers, Maximize2, MapPin, RefreshCw, SearchX } from "lucide-react";

import { apartmentsAPI, type Apartment, type ApartmentSearchParams } from "@/lib/api";
import { useTelegramWebApp } from "@/lib/useTelegramWebApp";

const ROOM_OPTIONS = [
  { value: null, label: "Все" },
  { value: 0, label: "Студия" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4+" },
];

const BTN_ACTIVE = "bg-[var(--tg-theme-button-color,#2dd4bf)] text-[var(--tg-theme-button-text-color,#0a0a0a)] font-semibold";
const BTN_IDLE = "bg-white/10 text-[var(--tg-theme-hint-color,#94a3b8)]";

export default function TmaSearchPage() {
  const twa = useTelegramWebApp();

  const [filters, setFilters] = useState<ApartmentSearchParams>({
    sort: "date_desc",
    limit: 20,
    page: 1,
    hide_duplicates: true,
  });
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const priceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show Telegram BackButton if we have multiple pages
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["tma-search", filters],
    queryFn: () => apartmentsAPI.search(filters),
    placeholderData: (prev) => prev,
  });

  const items = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;
  const pages = data?.data?.pages ?? 1;

  // Wire Telegram BackButton for pagination
  useEffect(() => {
    if (!twa) return;
    if (page > 1) {
      twa.BackButton.show();
      const handler = () => {
        const prev = page - 1;
        setPage(prev);
        setFilters((f) => ({ ...f, page: prev }));
      };
      twa.BackButton.onClick(handler);
      return () => twa.BackButton.offClick(handler);
    } else {
      twa.BackButton.hide();
    }
  }, [twa, page]);

  const update = useCallback((patch: Partial<ApartmentSearchParams>) => {
    setPage(1);
    setFilters((f) => ({ ...f, ...patch, page: 1 }));
  }, []);

  const applyPrice = useCallback(() => {
    const min = minPrice.trim() ? Number(minPrice) : undefined;
    const max = maxPrice.trim() ? Number(maxPrice) : undefined;
    update({ min_price: min, max_price: max });
  }, [minPrice, maxPrice, update]);

  useEffect(() => {
    if (priceTimer.current) clearTimeout(priceTimer.current);
    priceTimer.current = setTimeout(applyPrice, 600);
    return () => { if (priceTimer.current) clearTimeout(priceTimer.current); };
  }, [minPrice, maxPrice, applyPrice]);

  const nextPage = () => {
    if (page >= pages) return;
    const next = page + 1;
    setPage(next);
    setFilters((f) => ({ ...f, page: next }));
    twa?.HapticFeedback.selectionChanged();
  };

  const openLink = (apt: Apartment) => {
    twa?.openLink(apt.link, { try_instant_view: false }) ?? window.open(apt.link, "_blank");
    twa?.HapticFeedback.impactOccurred("light");
  };

  const inputCls =
    "w-full px-3 py-2 rounded-lg text-sm outline-none border border-white/10 focus:border-[var(--tg-theme-button-color,#2dd4bf)] text-[var(--tg-theme-text-color,#e2e8f0)] placeholder:text-[var(--tg-theme-hint-color,#64748b)] transition-colors";

  return (
    <div className="flex flex-col min-h-screen" style={{ paddingBottom: "env(safe-area-inset-bottom, 16px)" }}>
      {/* Header */}
      <div className="sticky top-0 z-20 px-4 pt-3 pb-3"
        style={{ background: "var(--tg-theme-bg-color, #0f172a)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <p className="text-[11px] font-semibold tracking-widest uppercase mb-3"
          style={{ color: "var(--tg-theme-hint-color, #64748b)" }}>
          KyrgPulse · Бишкек
        </p>

        {/* Rooms */}
        <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {ROOM_OPTIONS.map((opt) => (
            <button
              key={String(opt.value)}
              onClick={() => {
                update({ rooms: opt.value === null ? undefined : opt.value });
                twa?.HapticFeedback.selectionChanged();
              }}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                (filters.rooms ?? null) === opt.value ? BTN_ACTIVE : BTN_IDLE
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Price range */}
        <div className="flex gap-2 mt-2">
          <input
            type="number"
            inputMode="numeric"
            placeholder="Цена от"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className={inputCls}
            style={{ background: "var(--tg-theme-secondary-bg-color, rgba(255,255,255,0.06))" }}
          />
          <input
            type="number"
            inputMode="numeric"
            placeholder="до"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className={inputCls}
            style={{ background: "var(--tg-theme-secondary-bg-color, rgba(255,255,255,0.06))" }}
          />
        </div>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between px-4 py-2 text-xs"
        style={{ color: "var(--tg-theme-hint-color, #64748b)" }}>
        <span>
          {isLoading ? "Загрузка..." : `${total.toLocaleString("ru-RU")} объявлений`}
          {pages > 1 && ` · стр. ${page}/${pages}`}
        </span>
        {isFetching && !isLoading && <RefreshCw className="w-3 h-3 animate-spin" />}
      </div>

      {/* List */}
      <div className="flex-1 px-3 space-y-2">
        {isError ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <SearchX className="w-10 h-10" style={{ color: "var(--tg-theme-hint-color, #64748b)" }} />
            <p className="text-sm" style={{ color: "var(--tg-theme-hint-color, #64748b)" }}>
              Не удалось загрузить объявления
            </p>
            <button
              onClick={() => refetch()}
              className={`px-4 py-2 rounded-lg text-sm ${BTN_ACTIVE}`}
            >
              Повторить
            </button>
          </div>
        ) : isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl animate-pulse bg-white/5" />
          ))
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <SearchX className="w-10 h-10" style={{ color: "var(--tg-theme-hint-color, #64748b)" }} />
            <p className="text-sm" style={{ color: "var(--tg-theme-hint-color, #64748b)" }}>
              Ничего не найдено
            </p>
          </div>
        ) : (
          items.map((apt) => (
            <TmaCard key={apt.id} apartment={apt} onOpen={openLink} />
          ))
        )}
      </div>

      {/* Load more */}
      {!isLoading && !isError && page < pages && (
        <div className="px-4 py-4">
          <button
            onClick={nextPage}
            className={`w-full py-3 rounded-xl text-sm font-medium transition-opacity ${BTN_ACTIVE} ${isFetching ? "opacity-60" : ""}`}
          >
            {isFetching ? "Загрузка..." : `Ещё (стр. ${page + 1} из ${pages})`}
          </button>
        </div>
      )}
    </div>
  );
}

function TmaCard({
  apartment,
  onOpen,
}: {
  apartment: Apartment;
  onOpen: (apt: Apartment) => void;
}) {
  const roomsLabel =
    apartment.rooms === 0 ? "Студия" :
    apartment.rooms != null ? `${apartment.rooms}-комн.` : null;

  return (
    <button
      onClick={() => onOpen(apartment)}
      className="w-full text-left rounded-xl p-3.5 transition-colors active:scale-[0.98]"
      style={{ background: "var(--tg-theme-secondary-bg-color, rgba(255,255,255,0.06))" }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium line-clamp-2 flex-1"
          style={{ color: "var(--tg-theme-text-color, #e2e8f0)" }}>
          {apartment.title}
        </p>
        <ExternalLink className="w-3.5 h-3.5 shrink-0 mt-0.5"
          style={{ color: "var(--tg-theme-hint-color, #64748b)" }} />
      </div>

      <div className="mt-2 flex items-baseline gap-2 flex-wrap">
        <span className="text-base font-bold" style={{ color: "var(--tg-theme-button-color, #2dd4bf)" }}>
          {apartment.price.toLocaleString("ru-RU")} KGS
        </span>
        {apartment.price_per_m2 && (
          <span className="text-xs" style={{ color: "var(--tg-theme-hint-color, #64748b)" }}>
            {apartment.price_per_m2.toLocaleString("ru-RU")} /м²
          </span>
        )}
        {apartment.is_price_anomaly && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400">
            ⚠ цена
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs"
        style={{ color: "var(--tg-theme-hint-color, #64748b)" }}>
        {roomsLabel && (
          <span className="flex items-center gap-1">
            <Layers className="w-3 h-3" />{roomsLabel}
          </span>
        )}
        {apartment.total_area != null && (
          <span className="flex items-center gap-1">
            <Maximize2 className="w-3 h-3" />{apartment.total_area} м²
          </span>
        )}
        {apartment.address && (
          <span className="flex items-center gap-1 truncate max-w-[180px]">
            <MapPin className="w-3 h-3 shrink-0" />
            {apartment.address}
          </span>
        )}
      </div>
    </button>
  );
}
