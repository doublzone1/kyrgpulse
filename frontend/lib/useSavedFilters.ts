"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApartmentSearchParams } from "./api";

const KEY = "kp_saved_filters";
const MAX = 8;

export interface SavedFilter {
  name: string;
  params: ApartmentSearchParams;
  savedAt: string;
}

export function useSavedFilters() {
  const [saved, setSaved] = useState<SavedFilter[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      setSaved(raw ? JSON.parse(raw) : []);
    } catch {}
  }, []);

  const save = useCallback((name: string, params: ApartmentSearchParams) => {
    setSaved((prev) => {
      const deduped = prev.filter((f) => f.name !== name);
      const next = [
        { name, params, savedAt: new Date().toISOString() },
        ...deduped,
      ].slice(0, MAX);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const remove = useCallback((name: string) => {
    setSaved((prev) => {
      const next = prev.filter((f) => f.name !== name);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  return { saved, save, remove };
}
