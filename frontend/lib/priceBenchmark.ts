import type { Apartment } from "./api";

const HIGHLIGHT_THRESHOLD = 0.1; // ±10% от медианы — зона "обычно"

export type Verdict = "cheap" | "fair" | "expensive";

export interface PriceVerdict {
  verdict: Verdict;
  /** Отклонение от медианы в процентах. -12 = дешевле на 12%, +18 = дороже на 18%. */
  deltaPercent: number;
  /** Медиана, относительно которой считалось. */
  median: number;
  /** Сегмент: "по 2-комн." / "по студиям" / "по выборке". */
  segmentLabel: string;
}

/**
 * Считает медианные цены по сегментам:
 *   - отдельно для каждого rooms (0/1/2/3/...)
 *   - и общую медиану как fallback для квартир, у которых rooms неизвестно
 *
 * Минимум 4 квартиры в сегменте, иначе не считаем — слишком шумно.
 */
export function buildPriceBenchmark(
  apartments: readonly Apartment[],
): {
  byRooms: Map<number, number>;
  global: number | null;
  count: number;
} {
  const byRoomsValues = new Map<number, number[]>();
  const allValues: number[] = [];

  for (const apt of apartments) {
    if (!Number.isFinite(apt.price) || apt.price <= 0) continue;
    allValues.push(apt.price);
    if (apt.rooms != null) {
      const arr = byRoomsValues.get(apt.rooms);
      if (arr) arr.push(apt.price);
      else byRoomsValues.set(apt.rooms, [apt.price]);
    }
  }

  const byRooms = new Map<number, number>();
  for (const [rooms, values] of byRoomsValues) {
    if (values.length < 4) continue;
    byRooms.set(rooms, median(values));
  }

  return {
    byRooms,
    global: allValues.length >= 4 ? median(allValues) : null,
    count: allValues.length,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function segmentLabel(rooms: number | null | undefined): string {
  if (rooms == null) return "по выборке";
  if (rooms === 0) return "по студиям";
  return `по ${rooms}-комн.`;
}

/**
 * Возвращает вердикт цены против медианы. null если данных недостаточно
 * (нет цены или соответствующего сегмента).
 */
export function getPriceVerdict(
  apartment: Apartment,
  benchmark: ReturnType<typeof buildPriceBenchmark>,
): PriceVerdict | null {
  if (!Number.isFinite(apartment.price) || apartment.price <= 0) return null;

  const segmentMedian =
    apartment.rooms != null ? benchmark.byRooms.get(apartment.rooms) : undefined;
  const median = segmentMedian ?? benchmark.global;
  if (!median) return null;

  const deltaPercent = ((apartment.price - median) / median) * 100;
  let verdict: Verdict = "fair";
  if (deltaPercent <= -HIGHLIGHT_THRESHOLD * 100) verdict = "cheap";
  else if (deltaPercent >= HIGHLIGHT_THRESHOLD * 100) verdict = "expensive";

  return {
    verdict,
    deltaPercent: Math.round(deltaPercent),
    median,
    segmentLabel:
      segmentMedian != null
        ? segmentLabel(apartment.rooms)
        : segmentLabel(null),
  };
}
