"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Home, Layers, Maximize2, RefreshCw } from "lucide-react";
import type { Apartment } from "@/lib/api";

interface Props {
  apartments?: Apartment[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
}

const ROOM_FILTERS: Array<{ value: number | null; label: string }> = [
  { value: null, label: "Все" },
  { value: 0,    label: "Студия" },
  { value: 1,    label: "1-комн." },
  { value: 2,    label: "2-комн." },
  { value: 3,    label: "3-комн." },
];

function CardSkeleton() {
  return (
    <div className="glass rounded-lg p-5 flex flex-col gap-4 min-h-[160px]">
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-surface-raised rounded animate-pulse" />
          <div className="h-3 bg-surface-raised rounded animate-pulse w-4/5" />
        </div>
        <div className="w-4 h-4 bg-surface-raised rounded animate-pulse shrink-0 mt-0.5" />
      </div>
      <div className="mt-auto pt-4 border-t border-surface-border space-y-3">
        <div className="h-6 w-36 bg-surface-raised rounded animate-pulse" />
        <div className="flex gap-2">
          <div className="h-5 w-16 bg-surface-raised rounded-full animate-pulse" />
          <div className="h-5 w-16 bg-surface-raised rounded-full animate-pulse opacity-60" />
        </div>
      </div>
    </div>
  );
}

export default function ApartmentList({ apartments = [], loading, error, onRetry }: Props) {
  const [filter, setFilter] = useState<number | null>(null);

  const filtered =
    filter !== null
      ? apartments.filter((apartment) => apartment.rooms === filter)
      : apartments;

  return (
    <div className="glass rounded-lg p-6 md:p-8">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
        <h2 className="font-display text-xl md:text-2xl font-semibold text-neutral-100">
          Последние объявления
          <span className="text-neutral-500 font-normal text-base ml-2">lalafo.kg</span>
        </h2>

        <div className="flex flex-wrap gap-2">
          {ROOM_FILTERS.map(({ value, label }) => (
            <button
              key={String(value)}
              onClick={() => setFilter(value)}
              className={`px-4 py-1.5 rounded-md text-sm transition-all ${
                filter === value
                  ? "bg-primary-500/15 text-primary-400 border border-primary-500/25 shadow-glow-primary"
                  : "bg-surface-raised text-neutral-400 border border-transparent hover:text-neutral-200 hover:bg-surface-overlay"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* States */}
      {error ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="w-12 h-12 rounded-full bg-status-down/10 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-status-down" />
          </div>
          <div>
            <p className="text-neutral-200 font-medium">Не удалось загрузить объявления</p>
            <p className="text-sm text-neutral-500 mt-1">Проверьте backend и базу данных</p>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-5 py-2 rounded-md text-sm bg-surface-raised text-neutral-300 hover:text-neutral-100 hover:bg-surface-overlay transition-colors border border-surface-border-strong"
            >
              Повторить запрос
            </button>
          )}
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <div className="w-12 h-12 rounded-full bg-surface-raised flex items-center justify-center">
            <Home className="w-5 h-5 text-neutral-600" />
          </div>
          <div>
            <p className="text-neutral-300 font-medium">Объявлений нет</p>
            <p className="text-sm text-neutral-500 mt-1">
              Запусти парсер:{" "}
              <code className="text-primary-400 bg-primary-500/10 px-1.5 py-0.5 rounded text-xs">
                .\scripts\parse.ps1
              </code>
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {filtered.map((apartment, index) => (
            <motion.div
              key={apartment.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04, duration: 0.25 }}
              className="glass glass-hover rounded-lg p-5 flex flex-col"
            >
              {/* Title row */}
              <div className="flex justify-between items-start gap-3">
                <p className="line-clamp-2 text-sm text-neutral-200 leading-relaxed flex-1">
                  {apartment.title}
                </p>
                <a
                  href={apartment.link}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 p-1 -mr-1 rounded text-neutral-500 hover:text-primary-400 transition-colors"
                  title="Открыть на lalafo.kg"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>

              {/* Price + meta */}
              <div className="mt-auto pt-4 border-t border-surface-border">
                <p className="font-numeric text-xl font-semibold text-primary-400">
                  {apartment.price.toLocaleString("ru-RU")}{" "}
                  <span className="text-sm font-normal text-neutral-500">KGS</span>
                </p>

                <div className="flex flex-wrap gap-2 mt-2.5">
                  {apartment.rooms !== undefined && apartment.rooms !== null && (
                    <span className="inline-flex items-center gap-1 bg-surface-raised text-neutral-400 text-xs px-2.5 py-1 rounded-full">
                      <Layers className="w-3 h-3" />
                      {apartment.rooms === 0 ? "Студия" : `${apartment.rooms} комн.`}
                    </span>
                  )}
                  {apartment.total_area && (
                    <span className="inline-flex items-center gap-1 bg-surface-raised text-neutral-400 text-xs px-2.5 py-1 rounded-full">
                      <Maximize2 className="w-3 h-3" />
                      {apartment.total_area} м²
                    </span>
                  )}
                </div>

                {apartment.address && (
                  <p className="text-xs text-neutral-600 mt-2 truncate">
                    {apartment.address}
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
