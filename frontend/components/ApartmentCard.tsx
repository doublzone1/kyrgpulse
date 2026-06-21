"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  GitCompare,
  Layers,
  MapPin,
  Maximize2,
  Share2,
  Star,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import type { Apartment } from "@/lib/api";
import type { PriceVerdict } from "@/lib/priceBenchmark";
import type { DealGrade } from "@/lib/dealScore";
import { calcDealScore } from "@/lib/dealScore";
import { useCompare, useFavorites } from "@/lib/storage";

interface Props {
  apartment: Apartment;
  compact?: boolean;
  hideActions?: boolean;
  priceVerdict?: PriceVerdict | null;
}

export default function ApartmentCard({
  apartment,
  compact,
  hideActions,
  priceVerdict,
}: Props) {
  const favorites = useFavorites();
  const compare = useCompare();
  const [hint, setHint] = useState<string | null>(null);

  const roomsLabel =
    apartment.rooms === 0
      ? "Студия"
      : apartment.rooms != null
        ? `${apartment.rooms}-комн.`
        : null;

  const isFavorite = favorites.has(apartment.id);
  const isInCompare = compare.has(apartment.id);

  const daysOnMarket = apartment.first_seen_at
    ? Math.floor((Date.now() - new Date(apartment.first_seen_at).getTime()) / 86_400_000)
    : null;

  const deal = !compact ? calcDealScore(apartment, priceVerdict) : null;

  const onShare = () => {
    const url = `${window.location.origin}/apartments/${apartment.id}`;
    if (navigator.share) {
      navigator.share({ title: apartment.title, url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url);
      setHint("Ссылка скопирована");
      setTimeout(() => setHint(null), 2000);
    }
  };

  const onToggleCompare = () => {
    const result = compare.toggleLimited(apartment.id);
    if ("limitReached" in result && result.limitReached) {
      setHint(`Можно сравнить максимум ${compare.limit} квартиры`);
      setTimeout(() => setHint(null), 2500);
    }
  };

  return (
    <div data-testid="apartment-card" className="glass rounded-lg p-6 flex flex-col h-full relative">
      {!hideActions && (
        <div className="absolute top-3 right-3 flex gap-1">
          <button
            onClick={onShare}
            title="Поделиться"
            className="p-2 rounded-md transition-colors text-neutral-500 hover:text-neutral-300 hover:bg-surface-raised"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => favorites.toggle(apartment.id)}
            title={isFavorite ? "Убрать из избранного" : "В избранное"}
            className={`p-2 rounded-md transition-colors ${
              isFavorite
                ? "text-accent-400 bg-accent-500/10 hover:bg-accent-500/15"
                : "text-neutral-500 hover:text-accent-400 hover:bg-surface-raised"
            }`}
          >
            <Star className="w-4 h-4" fill={isFavorite ? "currentColor" : "none"} />
          </button>
          <button
            onClick={onToggleCompare}
            title={isInCompare ? "Убрать из сравнения" : "В сравнение"}
            className={`p-2 rounded-md transition-colors ${
              isInCompare
                ? "text-primary-400 bg-primary-500/10 hover:bg-primary-500/15"
                : "text-neutral-500 hover:text-primary-400 hover:bg-surface-raised"
            }`}
          >
            <GitCompare className="w-4 h-4" />
          </button>
        </div>
      )}

      {apartment.image_url && !compact && (
        <div className="w-full h-36 rounded-md overflow-hidden mb-3 -mt-1 bg-surface-raised">
          <img
            src={apartment.image_url}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).parentElement!.style.display = "none";
            }}
          />
        </div>
      )}

      {(apartment.is_price_anomaly || apartment.is_duplicate) && (
        <div className="flex gap-1.5 mb-2">
          {apartment.is_price_anomaly && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-yellow-500/15 text-yellow-400 border border-yellow-500/25">
              ⚠ цена
            </span>
          )}
          {apartment.is_duplicate && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-neutral-500/15 text-neutral-400 border border-neutral-500/25">
              дубль
            </span>
          )}
        </div>
      )}

      <div className="flex justify-between gap-3 pr-20">
        <Link
          href={`/apartments/${apartment.id}`}
          className="line-clamp-2 font-medium text-sm leading-relaxed hover:text-primary-400 transition-colors flex-1 text-neutral-200"
        >
          {apartment.title}
        </Link>
        <a
          href={apartment.link}
          target="_blank"
          rel="noreferrer"
          title="Открыть на lalafo.kg"
          className="shrink-0 text-neutral-500 hover:text-primary-400 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {hint && (
        <p className="text-xs text-accent-400 mt-2">{hint}</p>
      )}

      <div className="mt-auto pt-5">
        <div className="flex items-baseline gap-2 flex-wrap">
          <div className="font-numeric text-2xl font-bold text-primary-400">
            {apartment.price.toLocaleString("ru-RU")}{" "}
            <span className="text-base text-primary-400/60">KGS</span>
          </div>
          {priceVerdict && priceVerdict.verdict !== "fair" && (
            <PriceBadge verdict={priceVerdict} />
          )}
          {deal && (deal.grade === "fire" || deal.grade === "good") && (
            <DealBadge grade={deal.grade} label={deal.label} reasons={deal.reasons} />
          )}
        </div>
        {!compact && apartment.price_per_m2 ? (
          <div className="font-numeric text-xs text-neutral-500 mt-1">
            {apartment.price_per_m2.toLocaleString("ru-RU")} KGS/м²
          </div>
        ) : null}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-3 text-neutral-400">
          {roomsLabel && (
            <span className="flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" />
              {roomsLabel}
            </span>
          )}
          {apartment.total_area != null && (
            <span className="flex items-center gap-1">
              <Maximize2 className="w-3.5 h-3.5" />
              {apartment.total_area} м²
            </span>
          )}
          {apartment.floor && (
            <span className="text-neutral-500">этаж {apartment.floor}</span>
          )}
        </div>
        {apartment.address && (
          <p className="text-xs mt-2 text-neutral-600 truncate flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {apartment.address}
          </p>
        )}
        {daysOnMarket !== null && (
          <p className={`text-xs mt-1 ${daysOnMarket <= 3 ? "text-green-400" : daysOnMarket >= 30 ? "text-neutral-600" : "text-neutral-500"}`}>
            {daysOnMarket === 0
              ? "Сегодня"
              : daysOnMarket <= 3
              ? `🔥 ${daysOnMarket} дн. на рынке`
              : `${daysOnMarket} дн. на рынке`}
          </p>
        )}
        {!compact && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {apartment.is_new_building && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                Новостройка
              </span>
            )}
            {apartment.has_internet && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Интернет
              </span>
            )}
            {apartment.has_parking && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                Парковка
              </span>
            )}
            {apartment.house_type && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-raised text-neutral-500 border border-surface-border">
                {apartment.house_type === "panel" ? "Панель" : apartment.house_type === "brick" ? "Кирпич" : "Монолит"}
              </span>
            )}
            {(apartment.price_drop_count ?? 0) > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
                ⬇ {apartment.price_drop_count}× снизили цену
              </span>
            )}
          </div>
        )}
      </div>

      <Link
        href={`/apartments/${apartment.id}`}
        className="mt-4 text-xs text-primary-400 hover:text-primary-300 transition-colors"
      >
        Подробнее →
      </Link>
    </div>
  );
}

function DealBadge({ grade, label, reasons }: { grade: DealGrade; label: string; reasons: string[] }) {
  const cls =
    grade === "fire"
      ? "bg-green-500/15 text-green-400 border-green-500/25"
      : "bg-primary-500/10 text-primary-400 border-primary-500/20";
  return (
    <span
      title={reasons.join(" · ") || label}
      className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}

function PriceBadge({ verdict }: { verdict: PriceVerdict }) {
  const isCheap = verdict.verdict === "cheap";
  const Icon = isCheap ? TrendingDown : TrendingUp;
  const sign = isCheap ? "−" : "+";
  const absDelta = Math.abs(verdict.deltaPercent);

  const cls = isCheap
    ? "bg-status-up/10 text-status-up border-status-up/25"
    : "bg-status-down/10 text-status-down border-status-down/25";

  const tooltip = `${
    isCheap ? "Дешевле" : "Дороже"
  } медианы ${verdict.segmentLabel} на ${absDelta}% (медиана ${verdict.median.toLocaleString(
    "ru-RU",
  )} KGS)`;

  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-numeric font-semibold ${cls}`}
    >
      <Icon className="w-3 h-3" />
      {sign}{absDelta}%
    </span>
  );
}
