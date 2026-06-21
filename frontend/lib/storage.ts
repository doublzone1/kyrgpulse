"use client";

import { useCallback, useEffect, useState } from "react";

import type { ApartmentSearchParams } from "./api";

const KEY_FAVORITES = "kyrgpulse:favorites";
const KEY_COMPARE = "kyrgpulse:compare";
const KEY_LAST_FILTERS = "kyrgpulse:last-filters";

const COMPARE_LIMIT = 4;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function readArray(key: string): number[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => Number(v)).filter((n) => Number.isFinite(n));
  } catch {
    return [];
  }
}

function writeArray(key: string, ids: number[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent(`storage:${key}`));
  } catch {
    // localStorage может быть недоступен (приватный режим, квота) — молча игнорируем
  }
}

function useStoredIds(key: string): {
  ids: number[];
  has: (id: number) => boolean;
  toggle: (id: number) => void;
  remove: (id: number) => void;
  clear: () => void;
} {
  const [ids, setIds] = useState<number[]>([]);

  useEffect(() => {
    setIds(readArray(key));

    const onChange = () => setIds(readArray(key));
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) onChange();
    };
    window.addEventListener(`storage:${key}`, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(`storage:${key}`, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [key]);

  const toggle = useCallback(
    (id: number) => {
      const current = readArray(key);
      const next = current.includes(id)
        ? current.filter((i) => i !== id)
        : [...current, id];
      writeArray(key, next);
      setIds(next);
    },
    [key],
  );

  const remove = useCallback(
    (id: number) => {
      const next = readArray(key).filter((i) => i !== id);
      writeArray(key, next);
      setIds(next);
    },
    [key],
  );

  const clear = useCallback(() => {
    writeArray(key, []);
    setIds([]);
  }, [key]);

  const has = useCallback((id: number) => ids.includes(id), [ids]);

  return { ids, has, toggle, remove, clear };
}

export function useFavorites() {
  return useStoredIds(KEY_FAVORITES);
}

export function useCompare() {
  const store = useStoredIds(KEY_COMPARE);
  const toggleLimited = useCallback(
    (id: number) => {
      const current = readArray(KEY_COMPARE);
      if (current.includes(id)) {
        store.toggle(id);
        return { added: false };
      }
      if (current.length >= COMPARE_LIMIT) {
        return { added: false, limitReached: true } as const;
      }
      store.toggle(id);
      return { added: true } as const;
    },
    [store],
  );
  return { ...store, toggleLimited, limit: COMPARE_LIMIT };
}

// ----- Last filters -----

export function saveLastFilters(filters: ApartmentSearchParams): void {
  if (!isBrowser()) return;
  try {
    // Не сохраняем page — пользователь должен начинать с первой
    const { page: _page, ...rest } = filters;
    void _page;
    window.localStorage.setItem(KEY_LAST_FILTERS, JSON.stringify(rest));
  } catch {
    // ignore
  }
}

export function readLastFilters(): ApartmentSearchParams | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(KEY_LAST_FILTERS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as ApartmentSearchParams;
  } catch {
    return null;
  }
}

export function clearLastFilters(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(KEY_LAST_FILTERS);
}

/** Сколько активных фильтров в наборе (для бейджа на кнопке поиска). */
export function countActiveFilters(filters: ApartmentSearchParams | null): number {
  if (!filters) return 0;
  const counted: (keyof ApartmentSearchParams)[] = [
    "q",
    "zone",
    "min_price",
    "max_price",
    "rooms",
    "min_area",
    "max_area",
    "floor",
    "has_area",
  ];
  let count = 0;
  for (const key of counted) {
    const value = filters[key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "boolean" && !value) continue;
    count += 1;
  }
  return count;
}

export function buildSearchHref(filters: ApartmentSearchParams | null): string {
  if (!filters) return "/search";
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    sp.set(key, String(value));
  }
  const qs = sp.toString();
  return qs ? `/search?${qs}` : "/search";
}
