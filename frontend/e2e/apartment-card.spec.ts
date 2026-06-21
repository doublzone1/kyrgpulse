import { test, expect } from "@playwright/test";
import { mockBackend, MOCK_APARTMENT } from "./helpers";

test.describe("Apartment card — smoke", () => {
  test.beforeEach(async ({ page }) => {
    await mockBackend(page);
    await page.goto("/search");
    await page
      .locator("[data-testid='apartment-card']")
      .first()
      .waitFor({ state: "visible", timeout: 15_000 });
  });

  test("card shows price in KGS", async ({ page }) => {
    const card = page.locator("[data-testid='apartment-card']").first();
    await expect(card.locator("text=KGS").first()).toBeVisible();
  });

  test("card shows the mocked price value", async ({ page }) => {
    const card = page.locator("[data-testid='apartment-card']").first();
    const price = MOCK_APARTMENT.price.toLocaleString("ru-RU");
    await expect(card.locator(`text=${price}`).first()).toBeVisible();
  });

  test("card has external link to listing source", async ({ page }) => {
    const card = page.locator("[data-testid='apartment-card']").first();
    const extLink = card.locator("a[target='_blank']").first();
    await expect(extLink).toBeVisible();
    const href = await extLink.getAttribute("href");
    expect(href).toBeTruthy();
  });

  test("Подробнее link points to /apartments/:id", async ({ page }) => {
    const card = page.locator("[data-testid='apartment-card']").first();
    const detailLink = card.locator("text=Подробнее →");
    await expect(detailLink).toBeVisible();
    const href = await detailLink.getAttribute("href");
    expect(href).toMatch(/\/apartments\/\d+/);
  });

  test("favorite button is interactive", async ({ page }) => {
    const card = page.locator("[data-testid='apartment-card']").first();
    // First button in the actions row is the star/favourite
    const favBtn = card.locator("button").first();
    await favBtn.click();
    // Favourites link should appear in the header
    await expect(
      page.locator("a", { hasText: "Избранное" }),
    ).toBeVisible({ timeout: 3_000 });
  });

  test("all visible cards have a non-empty title", async ({ page }) => {
    const cards = page.locator("[data-testid='apartment-card']");
    const count = await cards.count();
    for (let i = 0; i < Math.min(count, 3); i++) {
      const titleLink = cards.nth(i).locator("a").first();
      const text = await titleLink.textContent();
      expect(text?.trim().length).toBeGreaterThan(0);
    }
  });
});
