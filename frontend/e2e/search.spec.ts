import { test, expect } from "@playwright/test";
import { mockBackend } from "./helpers";

test.describe("Search page — smoke", () => {
  test("renders heading", async ({ page }) => {
    await page.goto("/search");
    await expect(page.locator("h1")).toContainText("Поиск квартир");
  });

  test("page title includes city name (SSR metadata)", async ({ page }) => {
    await page.goto("/search");
    await expect(page).toHaveTitle(/Бишкек/);
  });

  test("title reflects room filter (dynamic metadata)", async ({ page }) => {
    await page.goto("/search?rooms=2");
    await expect(page).toHaveTitle(/2-комн/);
  });

  test("shows apartment cards after data loads", async ({ page }) => {
    await mockBackend(page);
    await page.goto("/search");
    const cards = page.locator("[data-testid='apartment-card']");
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test("CSV download link is present", async ({ page }) => {
    await page.goto("/search");
    const link = page.locator("a[download]");
    await expect(link.first()).toBeVisible({ timeout: 5_000 });
    const href = await link.first().getAttribute("href");
    expect(href).toContain("/apartments/export");
  });

  test("Telegram subscribe button is present", async ({ page }) => {
    await page.goto("/search");
    await expect(
      page.locator("button", { hasText: "Telegram" }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("rooms=1 filter in URL shows cards or no-results message", async ({
    page,
  }) => {
    await mockBackend(page);
    await page.goto("/search?rooms=1");
    // Wait for either a result card or the empty-state message
    await expect(
      page
        .locator("[data-testid='apartment-card']")
        .or(page.locator("text=ничего не найдено")),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Аналитика link goes to dashboard", async ({ page }) => {
    await page.goto("/search");
    const link = page.locator("a", { hasText: "Аналитика" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/dashboard");
  });
});
