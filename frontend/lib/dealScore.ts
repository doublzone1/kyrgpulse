import type { Apartment } from "./api";
import type { PriceVerdict } from "./priceBenchmark";

export type DealGrade = "fire" | "good" | "fair" | "overpriced";

export interface DealScore {
  grade: DealGrade;
  label: string;
  reasons: string[];
  score: number; // 0–100
}

export function calcDealScore(
  apt: Apartment,
  verdict: PriceVerdict | null | undefined,
): DealScore {
  let score = 50;
  const reasons: string[] = [];

  // Price vs median (-30 to +30)
  if (verdict) {
    if (verdict.verdict === "cheap") {
      const bonus = Math.min(30, verdict.deltaPercent * 0.8);
      score += bonus;
      if (verdict.deltaPercent >= 15) reasons.push(`Дешевле медианы на ${verdict.deltaPercent}%`);
    } else if (verdict.verdict === "expensive") {
      const penalty = Math.min(30, verdict.deltaPercent * 0.8);
      score -= penalty;
      if (verdict.deltaPercent >= 10) reasons.push(`Дороже медианы на ${verdict.deltaPercent}%`);
    }
  }

  // Days on market (-20 to +10)
  const days = apt.first_seen_at
    ? Math.floor((Date.now() - new Date(apt.first_seen_at).getTime()) / 86_400_000)
    : null;
  if (days !== null) {
    if (days <= 2) {
      score += 10;
      reasons.push("Новое объявление");
    } else if (days <= 7) {
      score += 5;
    } else if (days >= 30) {
      score -= 10;
      reasons.push("Давно на рынке");
    } else if (days >= 60) {
      score -= 20;
      reasons.push(`${days} дней без изменений`);
    }
  }

  // Price anomaly penalty (-15)
  if (apt.is_price_anomaly) {
    score -= 15;
    reasons.push("Аномальная цена");
  }

  // Has area → more data (+5)
  if (apt.total_area) score += 5;

  score = Math.max(0, Math.min(100, score));

  let grade: DealGrade;
  let label: string;
  if (score >= 75) { grade = "fire"; label = "🔥 Выгодно"; }
  else if (score >= 58) { grade = "good"; label = "✓ Хорошо"; }
  else if (score >= 42) { grade = "fair"; label = "Норма"; }
  else { grade = "overpriced"; label = "↑ Дорого"; }

  return { grade, label, reasons, score };
}
