"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck, X } from "lucide-react";

import type { ApartmentSearchParams } from "@/lib/api";
import { useSavedFilters } from "@/lib/useSavedFilters";

interface Props {
  current: ApartmentSearchParams;
  onLoad: (params: ApartmentSearchParams) => void;
}

function describeFilter(p: ApartmentSearchParams): string {
  const parts: string[] = [];
  if (p.rooms != null) parts.push(p.rooms === 0 ? "Студия" : `${p.rooms}-комн.`);
  if (p.max_price) parts.push(`до ${p.max_price.toLocaleString("ru-RU")}`);
  else if (p.min_price) parts.push(`от ${p.min_price.toLocaleString("ru-RU")}`);
  if (p.min_area || p.max_area)
    parts.push(
      p.min_area && p.max_area
        ? `${p.min_area}–${p.max_area} м²`
        : p.min_area
          ? `от ${p.min_area} м²`
          : `до ${p.max_area} м²`,
    );
  if (p.zone) parts.push(p.zone);
  if (p.source) parts.push(p.source);
  return parts.join(", ") || "Все квартиры";
}

const BTN_ACTIVE =
  "bg-primary-500/15 text-primary-400 border border-primary-500/25";
const BTN_IDLE =
  "bg-surface-raised text-neutral-400 border border-transparent hover:bg-surface-overlay hover:text-neutral-200";

export default function SavedFilters({ current, onLoad }: Props) {
  const { saved, save, remove } = useSavedFilters();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  const hasFilters =
    current.rooms != null ||
    current.min_price != null ||
    current.max_price != null ||
    current.zone ||
    current.min_area != null ||
    current.max_area != null ||
    current.source;

  if (!hasFilters && saved.length === 0) return null;

  return (
    <div className="glass rounded-lg px-5 py-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-neutral-500">
          <Bookmark className="w-3.5 h-3.5" />
          Сохранённые поиски
        </p>

        {hasFilters && !saving && (
          <button
            onClick={() => {
              setName(describeFilter(current));
              setSaving(true);
            }}
            className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 transition-colors"
          >
            <BookmarkCheck className="w-3.5 h-3.5" />
            Сохранить текущий
          </button>
        )}
      </div>

      {saving && (
        <div className="flex gap-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) {
                save(name.trim(), current);
                setSaving(false);
                setName("");
              }
              if (e.key === "Escape") setSaving(false);
            }}
            placeholder="Название поиска"
            className="flex-1 px-3 py-1.5 rounded-md bg-surface-card border border-surface-border focus:border-primary-500 outline-none text-sm text-neutral-200 placeholder:text-neutral-600"
          />
          <button
            disabled={!name.trim()}
            onClick={() => {
              if (!name.trim()) return;
              save(name.trim(), current);
              setSaving(false);
              setName("");
            }}
            className="px-3 py-1.5 rounded-md text-sm bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 transition-colors"
          >
            OK
          </button>
          <button
            onClick={() => setSaving(false)}
            className="px-2 py-1.5 rounded-md text-neutral-500 hover:text-neutral-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {saved.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {saved.map((f) => (
            <div key={f.name} className="flex items-center gap-1">
              <button
                onClick={() => onLoad(f.params)}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors border ${BTN_IDLE}`}
                title={describeFilter(f.params)}
              >
                {f.name}
              </button>
              <button
                onClick={() => remove(f.name)}
                className="p-1 text-neutral-600 hover:text-neutral-400 transition-colors"
                title="Удалить"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
