"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "kp_recently_viewed";
const MAX = 20;

export function useRecentlyViewed() {
  const [ids, setIds] = useState<number[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      setIds(raw ? JSON.parse(raw) : []);
    } catch {}
  }, []);

  const addId = useCallback((id: number) => {
    setIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setIds([]);
    try {
      localStorage.removeItem(KEY);
    } catch {}
  }, []);

  return { ids, addId, clear };
}
