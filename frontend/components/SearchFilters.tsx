"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

import type { ApartmentSearchParams, SortBy, Zone } from "@/lib/api";

interface Props {
  value: ApartmentSearchParams;
  onChange: (next: ApartmentSearchParams) => void;
  zones?: Zone[];
}

const ROOM_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: null, label: "Все" },
  { value: 0,   label: "Студия" },
  { value: 1,   label: "1-комн." },
  { value: 2,   label: "2-комн." },
  { value: 3,   label: "3-комн." },
  { value: 4,   label: "4+" },
];

const SORT_OPTIONS: Array<{ value: SortBy; label: string }> = [
  { value: "date_desc",  label: "Сначала новые" },
  { value: "deal_asc",   label: "🔥 Лучшие сделки" },
  { value: "price_asc",  label: "Цена: дешевле" },
  { value: "price_desc", label: "Цена: дороже" },
  { value: "area_desc",  label: "Площадь: больше" },
  { value: "area_asc",   label: "Площадь: меньше" },
];

function toNumber(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

const INPUT_CLS =
  "w-full px-3 py-2 rounded-md bg-surface-card border border-surface-border focus:border-primary-500 outline-none text-sm text-neutral-200 placeholder:text-neutral-600 transition-colors";

const FILTER_BTN_ACTIVE =
  "bg-primary-500/15 text-primary-400 border border-primary-500/25";
const FILTER_BTN_INACTIVE =
  "bg-surface-raised text-neutral-400 border border-transparent hover:bg-surface-overlay hover:text-neutral-200";

export default function SearchFilters({ value, onChange, zones }: Props) {
  const [q, setQ] = useState(value.q ?? "");

  useEffect(() => {
    setQ(value.q ?? "");
  }, [value.q]);

  useEffect(() => {
    const t = setTimeout(() => {
      if ((value.q ?? "") === q) return;
      onChange({ ...value, q: q || undefined, page: 1 });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const update = (patch: Partial<ApartmentSearchParams>) =>
    onChange({ ...value, ...patch, page: 1 });

  const reset = () =>
    onChange({ sort: value.sort ?? "date_desc", limit: value.limit, page: 1 });

  const hasActive =
    value.q ||
    value.zone ||
    value.rooms != null ||
    value.min_price != null ||
    value.max_price != null ||
    value.min_area != null ||
    value.max_area != null ||
    value.floor != null ||
    value.source != null ||
    value.hide_duplicates === false ||
    value.has_internet != null ||
    value.has_parking != null ||
    value.is_new_building != null;

  return (
    <div className="glass rounded-lg p-5 md:p-6 space-y-5">
      {/* Text search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Район, улица, ключевые слова"
          className={`${INPUT_CLS} pl-10`}
        />
      </div>

      {/* Rooms */}
      <div>
        <p className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Комнаты</p>
        <div className="flex flex-wrap gap-2">
          {ROOM_OPTIONS.map((opt) => {
            const active = (value.rooms ?? null) === opt.value;
            return (
              <button
                key={String(opt.value)}
                onClick={() => update({ rooms: opt.value === null ? undefined : opt.value })}
                className={`px-3.5 py-1.5 rounded-md text-sm transition-colors border ${
                  active ? FILTER_BTN_ACTIVE : FILTER_BTN_INACTIVE
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Zones */}
      {zones && zones.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Район / зона</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => update({ zone: undefined })}
              className={`px-3.5 py-1.5 rounded-md text-sm transition-colors border ${
                !value.zone ? FILTER_BTN_ACTIVE : FILTER_BTN_INACTIVE
              }`}
            >
              Все
            </button>
            {zones.map((z) => (
              <button
                key={z.id}
                onClick={() => update({ zone: z.id })}
                className={`px-3.5 py-1.5 rounded-md text-sm transition-colors border ${
                  value.zone === z.id ? FILTER_BTN_ACTIVE : FILTER_BTN_INACTIVE
                }`}
              >
                {z.label}
                <span className="ml-1.5 text-xs opacity-50">{z.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Source */}
      <div>
        <p className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Источник</p>
        <div className="flex flex-wrap gap-2 items-center">
          {[
            { value: undefined, label: "Все" },
            { value: "lalafo", label: "lalafo.kg" },
            { value: "house.kg", label: "house.kg" },
          ].map((opt) => (
            <button
              key={String(opt.value)}
              onClick={() => update({ source: opt.value })}
              className={`px-3.5 py-1.5 rounded-md text-sm transition-colors border ${
                (value.source ?? undefined) === opt.value
                  ? FILTER_BTN_ACTIVE
                  : FILTER_BTN_INACTIVE
              }`}
            >
              {opt.label}
            </button>
          ))}
          <label className="ml-3 flex items-center gap-2 text-sm text-neutral-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={value.hide_duplicates !== false}
              onChange={(e) => update({ hide_duplicates: e.target.checked })}
              className="accent-primary-500 w-3.5 h-3.5"
            />
            Скрыть дубли
          </label>
        </div>
      </div>

      {/* Number fields + sort */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <NumberField label="Цена от, KGS"   value={value.min_price} onChange={(v) => update({ min_price: v })} />
        <NumberField label="Цена до, KGS"   value={value.max_price} onChange={(v) => update({ max_price: v })} />
        <NumberField label="Площадь от, м²" value={value.min_area}  onChange={(v) => update({ min_area: v })} />
        <NumberField label="Площадь до, м²" value={value.max_area}  onChange={(v) => update({ max_area: v })} />
        <NumberField label="Этаж"           value={value.floor}     onChange={(v) => update({ floor: v })} />
        <div className="col-span-2 md:col-span-3">
          <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-2">
            Сортировка
          </label>
          <select
            value={value.sort ?? "date_desc"}
            onChange={(e) => update({ sort: e.target.value as SortBy })}
            className={INPUT_CLS}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Amenities */}
      <div>
        <p className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Удобства</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: "has_internet",  label: "Интернет" },
              { key: "has_parking",   label: "Парковка" },
              { key: "is_new_building", label: "Новостройка" },
            ] as { key: keyof ApartmentSearchParams; label: string }[]
          ).map(({ key, label }) => {
            const active = !!value[key];
            return (
              <button
                key={key}
                onClick={() => update({ [key]: active ? undefined : true })}
                className={`px-3.5 py-1.5 rounded-md text-sm transition-colors border ${
                  active ? FILTER_BTN_ACTIVE : FILTER_BTN_INACTIVE
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Reset */}
      {hasActive && (
        <button
          onClick={reset}
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-200 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Сбросить фильтры
        </button>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: number;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-2">
        {label}
      </label>
      <input
        type="number"
        inputMode="numeric"
        value={value ?? ""}
        onChange={(e) => onChange(toNumber(e.target.value))}
        className="w-full px-3 py-2 rounded-md bg-surface-card border border-surface-border focus:border-primary-500 outline-none text-sm text-neutral-200 transition-colors"
      />
    </div>
  );
}
