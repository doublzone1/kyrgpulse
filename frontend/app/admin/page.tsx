"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  Calendar,
  Database,
  Download,
  RefreshCw,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import PulseIndicator from "@/components/PulseIndicator";
import { apartmentsAPI, getExportUrl, type DataQuality } from "@/lib/api";

const FIELD_LABELS: Record<string, string> = {
  rooms: "Комнаты",
  total_area: "Площадь",
  floor: "Этаж",
  address: "Адрес",
  price_per_m2: "Цена за м²",
  params: "Описание",
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} ч назад`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD} дн назад`;
}

export default function AdminPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["data-quality"],
    queryFn: apartmentsAPI.getDataQuality,
    refetchInterval: 60_000,
  });

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
              <h1 className="font-display text-3xl md:text-4xl font-bold text-neutral-100 inline-flex items-center gap-3">
                <Database className="w-7 h-7 text-primary-400" />
                Data Quality
              </h1>
              <div className="flex items-center gap-3 mt-1">
                <PulseIndicator label="мониторинг pipeline" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={getExportUrl()}
              download
              className="glass px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-white/10"
              title="Экспорт всех объявлений в CSV"
            >
              <Download className="w-4 h-4 text-neutral-400" />
              Скачать CSV
            </a>
            <Link
              href="/admin/api-keys"
              className="glass px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-white/10 text-neutral-300"
            >
              API Keys
            </Link>
            <button
              onClick={() => refetch()}
              className="glass px-4 py-2 rounded-lg text-sm flex items-center gap-2 hover:bg-white/10"
            >
              <RefreshCw
                className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`}
              />
              Обновить
            </button>
            <a
              href="/api/admin/logout"
              className="glass px-4 py-2 rounded-lg text-sm text-neutral-500 hover:text-neutral-300 hover:bg-white/10 transition-all"
            >
              Выйти
            </a>
          </div>
        </header>

        {isLoading ? (
          <Skeleton />
        ) : isError || !data?.data ? (
          <ErrorBlock onRetry={() => refetch()} />
        ) : (
          <Content dq={data.data} />
        )}
      </div>
    </div>
  );
}

function Content({ dq }: { dq: DataQuality }) {
  return (
    <div className="space-y-6">
      <Summary dq={dq} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CoverageCard dq={dq} />
        <TimelineCard dq={dq} />
      </div>

      <SourcesCard dq={dq} />
    </div>
  );
}

function Summary({ dq }: { dq: DataQuality }) {
  const cards = [
    {
      label: "Всего объявлений",
      value: dq.total.toLocaleString("ru-RU"),
      sub: dq.total === 0 ? "БД пуста" : null,
    },
    {
      label: "Готовых для ML",
      value: dq.valid_for_ml.count.toLocaleString("ru-RU"),
      sub:
        dq.total > 0
          ? `${dq.valid_for_ml.pct}% от всех записей`
          : null,
    },
    {
      label: "Последняя обработка",
      value: formatRelative(dq.last_processed_at) || "—",
      sub: formatDateTime(dq.last_processed_at),
    },
    {
      label: "Последний парсинг",
      value: formatRelative(dq.last_parsed_at) || "—",
      sub: formatDateTime(dq.last_parsed_at),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="glass rounded-lg p-5">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            {c.label}
          </p>
          <p className="font-numeric text-2xl font-bold text-white mt-2">
            {c.value}
          </p>
          {c.sub && (
            <p className="text-xs text-neutral-500 mt-1 truncate">{c.sub}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function CoverageCard({ dq }: { dq: DataQuality }) {
  const fields = Object.keys(FIELD_LABELS).filter(
    (key) => dq.coverage[key] !== undefined,
  );

  return (
    <div className="glass rounded-lg p-6">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-5 h-5 text-primary-400" />
        <h2 className="font-display text-lg font-semibold">
          Покрытие полей
        </h2>
      </div>
      <p className="text-xs text-neutral-500 mb-4">
        Какой процент объявлений имеет непустое значение в поле. Чем выше —
        тем точнее работают фильтры и ML-модель.
      </p>
      <div className="space-y-3">
        {fields.map((key) => {
          const c = dq.coverage[key];
          const pct = c.pct;
          const color =
            pct >= 80
              ? "bg-status-up"
              : pct >= 50
                ? "bg-accent-500"
                : "bg-status-down";
          return (
            <div key={key}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-neutral-300">{FIELD_LABELS[key]}</span>
                <span className="font-numeric text-neutral-400">
                  <span className="text-white">{c.non_null}</span> / {dq.total}
                  <span className="text-neutral-500">
                    {" · "}
                    {pct}%
                  </span>
                </span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`h-full ${color} transition-all`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimelineCard({ dq }: { dq: DataQuality }) {
  const total = dq.timeline.reduce((s, t) => s + t.count, 0);

  const formatted = dq.timeline.map((t) => {
    const d = new Date(t.date);
    return {
      ...t,
      label: d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
    };
  });

  return (
    <div className="glass rounded-lg p-6">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="w-5 h-5 text-primary-400" />
        <h2 className="font-display text-lg font-semibold">
          Поступление за 14 дней
        </h2>
      </div>
      <p className="text-xs text-neutral-500 mb-4">
        Количество обработанных объявлений по дням. Всего за период:{" "}
        <span className="text-white font-numeric">{total}</span>.
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={formatted} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="label"
            stroke="#6b7280"
            tick={{ fill: "#9ca3af", fontSize: 11 }}
          />
          <YAxis stroke="#6b7280" tick={{ fill: "#9ca3af", fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              background: "rgb(27,27,30)",
              border: "1px solid rgba(20,184,166,0.2)",
              borderRadius: 8,
              fontSize: 12,
            }}
            cursor={{ fill: "rgba(20,184,166,0.07)" }}
          />
          <Bar dataKey="count" fill="#14b8a6" fillOpacity={0.85} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SourcesCard({ dq }: { dq: DataQuality }) {
  if (dq.sources.length === 0) {
    return null;
  }
  return (
    <div className="glass rounded-lg p-6">
      <h2 className="font-display text-lg font-semibold mb-4">
        Источники данных
      </h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left text-xs uppercase tracking-wide text-neutral-500 px-3 py-2">
                Источник
              </th>
              <th className="text-right text-xs uppercase tracking-wide text-neutral-500 px-3 py-2">
                Объявлений
              </th>
              <th className="text-right text-xs uppercase tracking-wide text-neutral-500 px-3 py-2">
                Доля
              </th>
              <th className="text-right text-xs uppercase tracking-wide text-neutral-500 px-3 py-2">
                Средняя цена
              </th>
            </tr>
          </thead>
          <tbody>
            {dq.sources.map((s) => {
              const pct = dq.total > 0 ? (s.count / dq.total) * 100 : 0;
              return (
                <tr key={s.source} className="border-b border-white/5">
                  <td className="px-3 py-3">
                    <span
                      className={`inline-block px-2 py-1 rounded text-xs font-mono ${
                        s.source === "lalafo"
                          ? "bg-primary-500/15 text-primary-300"
                          : "bg-accent-500/15 text-accent-300"
                      }`}
                    >
                      {s.source}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-numeric text-white">
                    {s.count.toLocaleString("ru-RU")}
                  </td>
                  <td className="px-3 py-3 text-right font-numeric text-neutral-400">
                    {pct.toFixed(1)}%
                  </td>
                  <td className="px-3 py-3 text-right font-numeric text-neutral-300">
                    {s.avg_price
                      ? `${s.avg_price.toLocaleString("ru-RU")} KGS`
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-surface-raised animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-72 rounded-lg bg-surface-raised animate-pulse" />
        <div className="h-72 rounded-lg bg-surface-raised animate-pulse" />
      </div>
    </div>
  );
}

function ErrorBlock({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="glass rounded-lg p-12 text-center">
      <p className="text-lg text-neutral-200 mb-2">
        Не удалось загрузить метрики
      </p>
      <p className="text-sm text-neutral-500 mb-5">
        Проверьте, что backend запущен и доступен.
      </p>
      <button
        onClick={onRetry}
        className="px-5 py-2 rounded-md bg-primary-500 text-surface-page font-semibold text-sm hover:bg-primary-400 transition-colors"
      >
        Повторить
      </button>
    </div>
  );
}
