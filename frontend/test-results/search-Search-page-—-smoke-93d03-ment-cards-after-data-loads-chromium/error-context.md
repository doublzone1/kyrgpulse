# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: search.spec.ts >> Search page — smoke >> shows apartment cards after data loads
- Location: e2e\search.spec.ts:19:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-testid=\'apartment-card\']').first()
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for locator('[data-testid=\'apartment-card\']').first()

```

```yaml
- banner:
  - link "На главную":
    - /url: /
    - img
  - heading "Поиск квартир" [level=1]
  - text: lalafo · live
  - link "Аналитика":
    - /url: /dashboard
    - img
    - text: Аналитика
  - link "CSV":
    - /url: http://localhost:8000/api/apartments/export?sort=date_desc
    - img
    - text: CSV
  - button "Telegram":
    - img
    - text: Telegram
- img
- textbox "Район, улица, ключевые слова"
- paragraph: Комнаты
- button "Все"
- button "Студия"
- button "1-комн."
- button "2-комн."
- button "3-комн."
- button "4+"
- text: Цена от, KGS
- spinbutton
- text: Цена до, KGS
- spinbutton
- text: Площадь от, м²
- spinbutton
- text: Площадь до, м²
- spinbutton
- text: Этаж
- spinbutton
- text: Сортировка
- combobox:
  - option "Сначала новые" [selected]
  - 'option "Цена: дешевле"'
  - 'option "Цена: дороже"'
  - 'option "Площадь: больше"'
  - 'option "Площадь: меньше"'
- paragraph: Ошибка запроса
- img
- paragraph: Не удалось загрузить объявления
- paragraph: Backend недоступен. Проверьте, что API запущен на localhost:8000.
- button "Повторить"
- alert
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test.describe("Search page — smoke", () => {
  4  |   test("renders heading", async ({ page }) => {
  5  |     await page.goto("/search");
  6  |     await expect(page.locator("h1")).toContainText("Поиск квартир");
  7  |   });
  8  | 
  9  |   test("page title includes city name (SSR metadata)", async ({ page }) => {
  10 |     await page.goto("/search");
  11 |     await expect(page).toHaveTitle(/Бишкек/);
  12 |   });
  13 | 
  14 |   test("title reflects room filter (dynamic metadata)", async ({ page }) => {
  15 |     await page.goto("/search?rooms=2");
  16 |     await expect(page).toHaveTitle(/2-комн/);
  17 |   });
  18 | 
  19 |   test("shows apartment cards after data loads", async ({ page }) => {
  20 |     await page.goto("/search");
  21 |     const cards = page.locator("[data-testid='apartment-card']");
> 22 |     await expect(cards.first()).toBeVisible({ timeout: 15_000 });
     |                                 ^ Error: expect(locator).toBeVisible() failed
  23 |     const count = await cards.count();
  24 |     expect(count).toBeGreaterThan(0);
  25 |   });
  26 | 
  27 |   test("CSV download link is present", async ({ page }) => {
  28 |     await page.goto("/search");
  29 |     const link = page.locator("a[download]");
  30 |     await expect(link.first()).toBeVisible({ timeout: 5_000 });
  31 |     const href = await link.first().getAttribute("href");
  32 |     expect(href).toContain("/apartments/export");
  33 |   });
  34 | 
  35 |   test("Telegram subscribe button is present", async ({ page }) => {
  36 |     await page.goto("/search");
  37 |     await expect(page.locator("button", { hasText: "Telegram" })).toBeVisible({
  38 |       timeout: 5_000,
  39 |     });
  40 |   });
  41 | 
  42 |   test("rooms=1 filter in URL shows matching result or no-results message", async ({
  43 |     page,
  44 |   }) => {
  45 |     await page.goto("/search?rooms=1");
  46 |     await page.waitForSelector(
  47 |       "[data-testid='apartment-card'], text=ничего не найдено",
  48 |       { timeout: 15_000 },
  49 |     );
  50 |   });
  51 | 
  52 |   test("Аналитика link goes to dashboard", async ({ page }) => {
  53 |     await page.goto("/search");
  54 |     const link = page.locator("a", { hasText: "Аналитика" });
  55 |     await expect(link).toBeVisible();
  56 |     await expect(link).toHaveAttribute("href", "/dashboard");
  57 |   });
  58 | });
  59 | 
```