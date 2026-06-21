"use client";

import React, { use, useEffect } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Calendar,
  ExternalLink,
  Home,
  Layers,
  MapPin,
  Maximize2,
  RefreshCw,
  SearchX,
  Share2,
  Wifi,
  Car,
} from "lucide-react";

import ApartmentCard from "@/components/ApartmentCard";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import { apartmentsAPI, getApiErrorMessage, type Apartment } from "@/lib/api";
import { useRecentlyViewed } from "@/lib/useRecentlyViewed";

// Те же ключевые слова, что и в SearchFilters/MapView, чтобы показать
// пользователю расчётную зону по адресу/заголовку.
const ZONE_KEYWORDS: Array<{ id: string; label: string; keywords: string[] }> = [
  {
    id: "center",
    label: "Центр",
    keywords: ["центр", "ала-тоо", "цум", "гум", "киевская", "токтогула", "эркиндик"],
  },
  {
    id: "south",
    label: "Южная часть",
    keywords: ["южн", "магистраль", "асанбе", "кок-жар", "кок жар", "джал", "жал"],
  },
  {
    id: "east",
    label: "Восточная часть",
    keywords: ["восток", "аламедин", "лебединовка", "ташырабат", "ташы рабат"],
  },
  {
    id: "west",
    label: "Западная часть",
    keywords: ["запад", "ошский", "кулиева", "ак-ордо", "ак ордо", "арча-бешик"],
  },
  {
    id: "north",
    label: "Северная часть",
    keywords: ["север", "дордой", "манас", "жибек жолу"],
  },
  {
    id: "microdistricts",
    label: "Микрорайоны",
    keywords: ["мкр", "микрорайон"],
  },
];

function detectZone(apartment: Apartment): { id: string; label: string } | null {
  const text = `${apartment.address ?? ""} ${apartment.title ?? ""}`.toLowerCase();
  if (!text.trim()) return null;
  return (
    ZONE_KEYWORDS.find((z) => z.keywords.some((kw) => text.includes(kw))) ?? null
  );
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function roomsLabel(rooms?: number | null): string {
  if (rooms == null) return "—";
  if (rooms === 0) return "Студия";
  return `${rooms}-комн.`;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ApartmentDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const apartmentId = Number(id);
  const idIsValid = Number.isFinite(apartmentId) && apartmentId > 0;
  const { addId } = useRecentlyViewed();

  const {
    data: apartmentRes,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["apartment", apartmentId],
    queryFn: () => apartmentsAPI.getById(apartmentId),
    enabled: idIsValid,
  });

  const apartment = apartmentRes?.data;

  // Записываем в историю просмотров при успешной загрузке
  useEffect(() => {
    if (apartment?.id) addId(apartment.id);
  }, [apartment?.id, addId]);

  const {
    data: similarRes,
    isLoading: similarLoading,
    isError: similarError,
  } = useQuery({
    queryKey: ["apartment-similar", apartmentId],
    queryFn: () => apartmentsAPI.getSimilar(apartmentId, 6),
    enabled: idIsValid && !!apartment,
  });

  const {
    data: priceHistoryRes,
    isLoading: priceHistoryLoading,
  } = useQuery({
    queryKey: ["apartment-price-history", apartmentId],
    queryFn: () => apartmentsAPI.getPriceHistory(apartmentId),
    enabled: idIsValid && !!apartment,
  });

  return (
    <div className="min-h-screen mountain-bg">
      <div className="relative z-10 max-w-5xl mx-auto p-6 md:p-8">
        <header className="flex items-center gap-4 mb-8">
          <Link
            href="/search"
            className="glass p-3 rounded-lg hover:bg-white/10 transition-all"
            title="К поиску"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-neutral-100">
              Объявление
            </h1>
            <p className="text-sm text-neutral-400">
              Бишкек · аренда · данные lalafo.kg
            </p>
          </div>
        </header>

        {!idIsValid ? (
          <NotFound message="Некорректный идентификатор квартиры." />
        ) : isLoading ? (
          <DetailSkeleton />
        ) : isError ? (
          <ErrorBlock message={getApiErrorMessage(error)} onRetry={refetch} />
        ) : !apartment ? (
          <NotFound message="Квартира не найдена. Возможно, объявление удалили." />
        ) : (
          <DetailContent
            apartment={apartment}
            similar={similarRes?.data ?? []}
            similarLoading={similarLoading}
            similarError={similarError}
            priceHistory={priceHistoryRes?.data?.history ?? []}
            priceHistoryLoading={priceHistoryLoading}
          />
        )}
      </div>
    </div>
  );
}

function DetailContent({
  apartment,
  similar,
  similarLoading,
  similarError,
  priceHistory,
  priceHistoryLoading,
}: {
  apartment: Apartment;
  similar: Apartment[];
  similarLoading: boolean;
  similarError: boolean;
  priceHistory: { price: number; recorded_at: string; change_pct: number | null }[];
  priceHistoryLoading: boolean;
}) {
  const zone = detectZone(apartment);
  const publishedAt = formatDate(apartment.parsed_at);

  const facts: Array<{ icon: typeof Home; label: string; value: string }> = [
    {
      icon: Home,
      label: "Комнаты",
      value: roomsLabel(apartment.rooms),
    },
    {
      icon: Maximize2,
      label: "Площадь",
      value:
        apartment.total_area != null ? `${apartment.total_area} м²` : "—",
    },
    {
      icon: Layers,
      label: "Этаж",
      value: apartment.floor || "—",
    },
    {
      icon: MapPin,
      label: "Зона",
      value: zone ? zone.label : "не определена",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="glass rounded-lg p-6 md:p-8">
        {apartment.image_url && (
          <PhotoGallery imageUrl={apartment.image_url} title={apartment.title} />
        )}
        <h2 className="text-2xl md:text-3xl font-bold leading-snug">
          {apartment.title}
        </h2>

        <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-numeric text-4xl font-bold text-primary-400">
            {apartment.price.toLocaleString("ru-RU")}{" "}
            <span className="text-2xl text-primary-400/60">KGS</span>
          </span>
          {apartment.price_per_m2 ? (
            <span className="text-sm text-neutral-400">
              {apartment.price_per_m2.toLocaleString("ru-RU")} KGS/м²
            </span>
          ) : null}
        </div>

        {apartment.address && (
          <p className="mt-4 text-sm text-neutral-300 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-neutral-500" />
            {apartment.address}
          </p>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          {facts.map((f) => (
            <div
              key={f.label}
              className="bg-surface-raised border border-surface-border rounded-lg p-4"
            >
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-neutral-500">
                <f.icon className="w-3.5 h-3.5" />
                {f.label}
              </div>
              <p className="text-base font-semibold text-white mt-1">
                {f.value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-neutral-500">
          {publishedAt && (
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              опубликовано: {publishedAt}
            </span>
          )}
          <span>источник: {apartment.source}</span>
          {zone && (
            <Link
              href={`/search?zone=${zone.id}`}
              className="text-primary-400 hover:text-primary-300 transition-colors"
            >
              ещё в зоне «{zone.label}»
            </Link>
          )}
        </div>

        {/* Amenity badges */}
        <div className="flex flex-wrap gap-2 mt-4">
          {apartment.is_new_building && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              Новостройка
            </span>
          )}
          {apartment.has_internet && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Wifi className="w-3 h-3" /> Интернет
            </span>
          )}
          {apartment.has_parking && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Car className="w-3 h-3" /> Парковка
            </span>
          )}
          {apartment.house_type && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-surface-raised text-neutral-400 border border-surface-border">
              {apartment.house_type === "panel" ? "Панельный дом" : apartment.house_type === "brick" ? "Кирпичный дом" : "Монолит"}
            </span>
          )}
          {(apartment.price_drop_count ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-green-500/10 text-green-400 border border-green-500/20">
              ⬇ Цена снижалась {apartment.price_drop_count} раз(а)
            </span>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={apartment.link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary-600 hover:bg-primary-500 text-surface-page font-medium transition-colors"
          >
            Открыть на {apartment.source}
            <ExternalLink className="w-4 h-4" />
          </a>
          <ShareButton title={apartment.title} />
        </div>
      </div>

      <div className="glass rounded-lg p-6 md:p-8">
        <h3 className="text-lg font-semibold mb-3">Описание</h3>
        {apartment.params && apartment.params.trim().length > 0 ? (
          <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-line">
            {apartment.params}
          </p>
        ) : (
          <p className="text-sm text-neutral-500">
            Описание не указано в объявлении. Подробности — на странице
            источника.
          </p>
        )}
      </div>

      <div className="glass rounded-lg p-6 md:p-8">
        <h3 className="text-lg font-semibold mb-4">История цены</h3>
        <PriceHistoryChart
          currentPrice={apartment.price}
          history={priceHistory}
          loading={priceHistoryLoading}
        />
      </div>

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="text-xl font-semibold">Похожие квартиры</h3>
          <Link
            href={`/search?rooms=${apartment.rooms ?? ""}`}
            className="text-sm text-cyan-400 hover:text-cyan-300"
          >
            Больше вариантов →
          </Link>
        </div>

        {similarError ? (
          <p className="glass rounded-lg p-6 text-sm text-neutral-400">
            Не удалось загрузить похожие объявления.
          </p>
        ) : similarLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-48 rounded-lg bg-surface-raised animate-pulse"
              />
            ))}
          </div>
        ) : similar.length === 0 ? (
          <p className="glass rounded-lg p-6 text-sm text-neutral-500">
            Похожих квартир пока не нашлось. Попробуйте смягчить фильтры в
            поиске.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {similar.map((apt) => (
              <ApartmentCard key={apt.id} apartment={apt} compact />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-8">
      <div className="glass rounded-lg p-6 md:p-8">
        <div className="h-8 w-3/4 bg-surface-raised rounded animate-pulse" />
        <div className="h-12 w-1/2 bg-neutral-800 rounded mt-4 animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 bg-surface-raised rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
      <div className="h-32 glass rounded-lg animate-pulse" />
    </div>
  );
}

function ErrorBlock({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="glass rounded-lg p-12 text-center">
      <RefreshCw className="w-12 h-12 mx-auto mb-4 text-neutral-500" />
      <p className="text-lg text-neutral-200 mb-2">
        Не удалось загрузить объявление
      </p>
      <p className="text-sm text-neutral-500 mb-5">{message}</p>
      <button
        onClick={onRetry}
        className="px-5 py-2 rounded-md bg-primary-600 hover:bg-primary-500 text-surface-page text-sm font-medium transition-colors"
      >
        Повторить
      </button>
    </div>
  );
}

function NotFound({ message }: { message: string }) {
  return (
    <div className="glass rounded-lg p-12 text-center">
      <SearchX className="w-12 h-12 mx-auto mb-4 text-neutral-500" />
      <p className="text-lg text-neutral-200 mb-2">{message}</p>
      <Link
        href="/search"
        className="inline-block mt-3 text-sm text-cyan-400 hover:text-cyan-300"
      >
        Вернуться к поиску
      </Link>
    </div>
  );
}

function PhotoGallery({ imageUrl, title }: { imageUrl: string; title: string }) {
  return (
    <div className="w-full h-56 md:h-80 rounded-lg overflow-hidden mb-6 bg-surface-raised relative group">
      <img
        src={imageUrl}
        alt={title}
        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        onError={(e) => {
          (e.target as HTMLImageElement).parentElement!.style.display = "none";
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
}

function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = React.useState(false);

  const onShare = () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title, url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={onShare}
      className="inline-flex items-center gap-2 px-5 py-3 rounded-lg glass hover:bg-white/10 text-neutral-300 font-medium transition-colors text-sm"
    >
      <Share2 className="w-4 h-4" />
      {copied ? "Скопировано!" : "Поделиться"}
    </button>
  );
}
