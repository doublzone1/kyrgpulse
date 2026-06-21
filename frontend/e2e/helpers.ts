import type { Page } from "@playwright/test";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api";

export const MOCK_APARTMENT = {
  id: 1,
  title: "Уютная 2-комнатная квартира в центре Бишкека",
  price: 25_000,
  price_per_m2: 454,
  rooms: 2,
  total_area: 55,
  floor: "3/5",
  address: "ул. Киевская, 100",
  source: "lalafo",
  currency: "KGS",
  link: "https://lalafo.kg/listing/1",
  parsed_at: new Date().toISOString(),
  processed_at: new Date().toISOString(),
};

const MOCK_LIST = {
  items: [MOCK_APARTMENT],
  total: 1,
  page: 1,
  limit: 24,
  pages: 1,
};

/**
 * Intercepts browser-side requests to the backend and returns fixture data.
 * Call before page.goto() so the mock is in place before navigation.
 */
export async function mockBackend(page: Page) {
  await page.route(`${API_BASE}/**`, async (route, request) => {
    const url = request.url();

    if (url.includes("/zones")) {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ zones: [], unknown_count: 0 }),
      });
    }
    if (url.includes("/apartments/export")) {
      return route.fulfill({ contentType: "text/csv", body: "" });
    }
    if (url.includes("/analytics/")) {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ trend: [], items: [], data: [] }),
      });
    }
    if (url.includes("/apartments/")) {
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(MOCK_LIST),
      });
    }

    return route.continue();
  });
}
