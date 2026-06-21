# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: search.spec.ts >> Search page — smoke >> rooms=1 filter in URL shows matching result or no-results message
- Location: e2e\search.spec.ts:42:7

# Error details

```
Error: page.waitForSelector: Unexpected token "=" while parsing css selector "[data-testid='apartment-card'], text=ничего не найдено". Did you mean to CSS.escape it?
Call log:
  - waiting for [data-testid='apartment-card'], text=ничего не найдено to be visible

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - banner [ref=e4]:
      - generic [ref=e5]:
        - link "На главную" [ref=e6] [cursor=pointer]:
          - /url: /
          - img [ref=e7]
        - generic [ref=e9]:
          - heading "Поиск квартир" [level=1] [ref=e10]
          - generic [ref=e17]: lalafo · live
      - generic [ref=e18]:
        - link "Аналитика" [ref=e19] [cursor=pointer]:
          - /url: /dashboard
          - img [ref=e20]
          - text: Аналитика
        - link "CSV" [ref=e22] [cursor=pointer]:
          - /url: http://localhost:8000/api/apartments/export?rooms=1&sort=date_desc
          - img [ref=e23]
          - text: CSV
        - button "Telegram" [ref=e26] [cursor=pointer]:
          - img [ref=e27]
          - text: Telegram
    - generic [ref=e30]:
      - generic [ref=e31]:
        - img
        - textbox "Район, улица, ключевые слова" [ref=e32]
      - generic [ref=e33]:
        - paragraph [ref=e34]: Комнаты
        - generic [ref=e35]:
          - button "Все" [ref=e36] [cursor=pointer]
          - button "Студия" [ref=e37] [cursor=pointer]
          - button "1-комн." [ref=e38] [cursor=pointer]
          - button "2-комн." [ref=e39] [cursor=pointer]
          - button "3-комн." [ref=e40] [cursor=pointer]
          - button "4+" [ref=e41] [cursor=pointer]
      - generic [ref=e42]:
        - generic [ref=e43]:
          - generic [ref=e44]: Цена от, KGS
          - spinbutton [ref=e45]
        - generic [ref=e46]:
          - generic [ref=e47]: Цена до, KGS
          - spinbutton [ref=e48]
        - generic [ref=e49]:
          - generic [ref=e50]: Площадь от, м²
          - spinbutton [ref=e51]
        - generic [ref=e52]:
          - generic [ref=e53]: Площадь до, м²
          - spinbutton [ref=e54]
        - generic [ref=e55]:
          - generic [ref=e56]: Этаж
          - spinbutton [ref=e57]
        - generic [ref=e58]:
          - generic [ref=e59]: Сортировка
          - combobox [ref=e60]:
            - option "Сначала новые" [selected]
            - 'option "Цена: дешевле"'
            - 'option "Цена: дороже"'
            - 'option "Площадь: больше"'
            - 'option "Площадь: меньше"'
      - button "Сбросить фильтры" [ref=e61] [cursor=pointer]:
        - img [ref=e62]
        - text: Сбросить фильтры
    - paragraph [ref=e66]: Загрузка...
  - button "Open Next.js Dev Tools" [ref=e79] [cursor=pointer]:
    - img [ref=e80]
  - alert [ref=e83]
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
  22 |     await expect(cards.first()).toBeVisible({ timeout: 15_000 });
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
> 46 |     await page.waitForSelector(
     |                ^ Error: page.waitForSelector: Unexpected token "=" while parsing css selector "[data-testid='apartment-card'], text=ничего не найдено". Did you mean to CSS.escape it?
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