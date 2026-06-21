import axios from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api",
  timeout: 15000,
});

export interface Apartment {
  id: number;
  title: string;
  price: number;
  price_per_m2?: number | null;
  address?: string | null;
  rooms?: number | null;
  total_area?: number | null;
  floor?: string | null;
  params?: string | null;
  source: string;
  currency: string;
  link: string;
  parsed_at: string;
  processed_at: string;
  is_duplicate: boolean;
  is_price_anomaly: boolean;
  lat?: number | null;
  lng?: number | null;
  image_url?: string | null;
  first_seen_at?: string | null;
  price_drop_count?: number;
  house_type?: string | null;
  has_internet?: boolean | null;
  has_parking?: boolean | null;
  is_new_building?: boolean | null;
}

export interface ApartmentListResponse {
  items: Apartment[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface Zone {
  id: string;
  label: string;
  position: [number, number];
  count: number;
}

export interface ZonesResponse {
  zones: Zone[];
  unknown_count: number;
}

export type SortBy =
  | "date_desc"
  | "price_asc"
  | "price_desc"
  | "area_asc"
  | "area_desc"
  | "deal_asc";

export interface ApartmentSearchParams {
  q?: string;
  zone?: string;
  min_price?: number;
  max_price?: number;
  rooms?: number;
  min_area?: number;
  max_area?: number;
  floor?: number;
  has_area?: boolean;
  source?: string;
  hide_duplicates?: boolean;
  has_internet?: boolean;
  has_parking?: boolean;
  is_new_building?: boolean;
  sort?: SortBy;
  page?: number;
  limit?: number;
}

function cleanParams(
  params?: ApartmentSearchParams,
): Record<string, unknown> | undefined {
  if (!params) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    out[key] = value;
  }
  return out;
}

export interface DataQuality {
  total: number;
  last_processed_at: string | null;
  last_parsed_at: string | null;
  coverage: Record<string, { non_null: number; pct: number }>;
  sources: Array<{
    source: string;
    count: number;
    avg_price: number | null;
  }>;
  timeline: Array<{ date: string; count: number }>;
  valid_for_ml: { count: number; pct: number };
}

export interface PriceHistoryPoint {
  price: number;
  recorded_at: string;
  change_pct: number | null;
}

export interface PriceHistoryResponse {
  apartment_id: number;
  current_price: number;
  history: PriceHistoryPoint[];
}

export interface ZoneComparisonItem {
  zone_id: string;
  label: string;
  count: number;
  avg_price: number | null;
  min_price: number | null;
  max_price: number | null;
  avg_price_per_m2: number | null;
}

export interface ZoneTrendPoint {
  week: string;
  avg_price: number;
  count: number;
}

export interface ZoneTrendResult {
  [zone_id: string]: { label: string; data: ZoneTrendPoint[] };
}

export interface AffordabilityItem {
  zone_id: string;
  label: string;
  avg_price: number;
  avg_salary: number;
  rent_to_income: number;
  count: number;
}

export interface SeasonalityPoint {
  month: number;
  month_label: string;
  avg_price: number;
  count: number;
}

export interface FloorStatPoint {
  floor: number;
  avg_price: number | null;
  avg_price_per_m2: number | null;
  count: number;
}

export interface ForecastResult {
  zone: string | null;
  trend: "up" | "down" | "flat" | "insufficient_data";
  weekly_change_pct: number;
  history: { week: string; avg_price: number; count: number }[];
  forecast: { week: string; predicted_price: number }[];
}

export const apartmentsAPI = {
  search: (params?: ApartmentSearchParams) =>
    api.get<ApartmentListResponse>("/apartments/", {
      params: cleanParams(params),
    }),
  getStats: () => api.get("/apartments/stats"),
  getZones: () => api.get<ZonesResponse>("/apartments/zones"),
  getDataQuality: () => api.get<DataQuality>("/apartments/data-quality"),
  getById: (id: number) => api.get<Apartment>(`/apartments/${id}`),
  getSimilar: (id: number, limit = 6) =>
    api.get<Apartment[]>(`/apartments/${id}/similar`, { params: { limit } }),
  getPriceHistory: (id: number) =>
    api.get<PriceHistoryResponse>(`/apartments/${id}/price-history`),
};

export interface PricePredictionResponse {
  predicted_price: number;
  price_per_m2: number;
  confidence?: number | null;
  similar_apartments: number[];
  currency: string;
  converted_prices?: Record<string, number> | null;
  model_status: string;
  model_mae?: number | null;
  model_r2?: number | null;
  note?: string | null;
}

export interface PriceTrendPoint {
  date: string;
  avg_price: number;
  count: number;
}

export function getExportUrl(params?: ApartmentSearchParams): string {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";
  if (!params) return `${base}/apartments/export`;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `${base}/apartments/export?${qs}` : `${base}/apartments/export`;
}

export const telegramAPI = {
  generateLink: (filters: ApartmentSearchParams, label?: string) =>
    api.post<{ url: string; expires_in: number }>("/telegram/link", { filters, label }),
};

export const analyticsAPI = {
  predictPrice: (data: { rooms: number; total_area: number; floor?: string }) =>
    api.post<PricePredictionResponse>("/analytics/predict", data),
  getDistribution: () => api.get("/analytics/distribution"),
  trainModel: () => api.post("/analytics/train-model"),
  getCurrencyRates: () => api.get("/analytics/currency/rates"),
  getTrend: (params?: { days?: number; rooms?: number }) =>
    api.get<{ trend: PriceTrendPoint[] }>("/analytics/price-trend", { params }),
  getZonesComparison: () =>
    api.get<{ zones: ZoneComparisonItem[] }>("/analytics/zones-comparison"),
  getZonePriceTrend: (days = 30) =>
    api.get<ZoneTrendResult>("/analytics/zone-price-trend", { params: { days } }),
  getAffordability: () =>
    api.get<{ affordability: AffordabilityItem[]; avg_salary: number }>("/analytics/affordability"),
  getSeasonality: () =>
    api.get<SeasonalityPoint[]>("/analytics/seasonality"),
  getTopDeals: (limit = 10, rooms?: number) =>
    api.get<{ items: Apartment[] }>("/analytics/top-deals", { params: { limit, rooms } }),
  getFloorStats: () =>
    api.get<FloorStatPoint[]>("/analytics/floor-stats"),
  getPriceForecast: (zone?: string, days = 90) =>
    api.get<ForecastResult>("/analytics/price-forecast", { params: { zone, days } }),
};

export function getApiErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") {
      return detail;
    }
    if (detail && typeof detail === "object") {
      return detail.message || JSON.stringify(detail);
    }
    if (error.code === "ECONNABORTED") {
      return "API не ответил за 15 секунд. Проверьте backend или повторите позже.";
    }
    if (!error.response) {
      return "Backend недоступен. Проверьте, что API запущен на localhost:8000.";
    }
  }
  return "Не удалось выполнить запрос к API.";
}

export default api;
