"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  page: number;
  pages: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, pages, onPageChange }: Props) {
  if (pages <= 1) return null;

  const go = (p: number) => {
    if (p < 1 || p > pages || p === page) return;
    onPageChange(p);
  };

  const items: Array<number | "..."> = [];
  const add = (n: number) => {
    if (!items.includes(n) && n >= 1 && n <= pages) items.push(n);
  };
  add(1);
  for (let i = page - 1; i <= page + 1; i++) add(i);
  add(pages);
  const withDots: Array<number | "..."> = [];
  for (let i = 0; i < items.length; i++) {
    const cur = items[i];
    const prev = items[i - 1];
    if (typeof cur === "number" && typeof prev === "number" && cur - prev > 1) {
      withDots.push("...");
    }
    withDots.push(cur);
  }

  return (
    <div className="flex items-center justify-center gap-1.5 mt-8">
      <button
        onClick={() => go(page - 1)}
        disabled={page <= 1}
        className="p-2 rounded-md bg-surface-raised text-neutral-400 hover:bg-surface-overlay hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {withDots.map((it, idx) =>
        it === "..." ? (
          <span key={`d-${idx}`} className="w-9 text-center text-sm text-neutral-600">
            …
          </span>
        ) : (
          <button
            key={it}
            onClick={() => go(it)}
            className={`min-w-[36px] h-9 px-3 rounded-md text-sm transition-colors border ${
              it === page
                ? "bg-primary-500/15 text-primary-400 border-primary-500/25"
                : "bg-surface-raised text-neutral-400 border-transparent hover:bg-surface-overlay hover:text-neutral-200"
            }`}
          >
            {it}
          </button>
        ),
      )}

      <button
        onClick={() => go(page + 1)}
        disabled={page >= pages}
        className="p-2 rounded-md bg-surface-raised text-neutral-400 hover:bg-surface-overlay hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
