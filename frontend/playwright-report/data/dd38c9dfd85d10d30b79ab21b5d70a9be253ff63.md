# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: apartment-card.spec.ts >> Apartment card — smoke >> favorite button is interactive
- Location: e2e\apartment-card.spec.ts:34:7

# Error details

```
TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('[data-testid=\'apartment-card\']').first() to be visible

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
          - /url: http://localhost:8000/api/apartments/export?sort=date_desc
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
    - paragraph [ref=e62]: Ошибка запроса
    - generic [ref=e63]:
      - img [ref=e64]
      - paragraph [ref=e69]: Не удалось загрузить объявления
      - paragraph [ref=e70]: Backend недоступен. Проверьте, что API запущен на localhost:8000.
      - button "Повторить" [ref=e71] [cursor=pointer]
  - button "Open Next.js Dev Tools" [ref=e77] [cursor=pointer]:
    - img [ref=e78]
  - alert [ref=e81]
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test.describe("Apartment card — smoke", () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto("/search");
  6  |     // Wait for at least one card to be visible before each test
> 7  |     await page.locator("[data-testid='apartment-card']").first().waitFor({
     |                                                                  ^ TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
  8  |       state: "visible",
  9  |       timeout: 15_000,
  10 |     });
  11 |   });
  12 | 
  13 |   test("card shows price in KGS", async ({ page }) => {
  14 |     const card = page.locator("[data-testid='apartment-card']").first();
  15 |     await expect(card.locator("text=KGS").first()).toBeVisible();
  16 |   });
  17 | 
  18 |   test("card has external link to listing source", async ({ page }) => {
  19 |     const card = page.locator("[data-testid='apartment-card']").first();
  20 |     const extLink = card.locator("a[target='_blank']").first();
  21 |     await expect(extLink).toBeVisible();
  22 |     const href = await extLink.getAttribute("href");
  23 |     expect(href).toBeTruthy();
  24 |   });
  25 | 
  26 |   test("Подробнее link points to /apartments/:id", async ({ page }) => {
  27 |     const card = page.locator("[data-testid='apartment-card']").first();
  28 |     const detailLink = card.locator("text=Подробнее →");
  29 |     await expect(detailLink).toBeVisible();
  30 |     const href = await detailLink.getAttribute("href");
  31 |     expect(href).toMatch(/\/apartments\/\d+/);
  32 |   });
  33 | 
  34 |   test("favorite button is interactive", async ({ page }) => {
  35 |     const card = page.locator("[data-testid='apartment-card']").first();
  36 |     const favBtn = card.locator("button").first();
  37 |     await favBtn.click();
  38 |     // After clicking, favorites link should appear in header
  39 |     await expect(page.locator("a", { hasText: "Избранное" })).toBeVisible({
  40 |       timeout: 3_000,
  41 |     });
  42 |   });
  43 | 
  44 |   test("all cards have a title", async ({ page }) => {
  45 |     const cards = page.locator("[data-testid='apartment-card']");
  46 |     const count = await cards.count();
  47 |     for (let i = 0; i < Math.min(count, 3); i++) {
  48 |       const titleLink = cards.nth(i).locator("a").first();
  49 |       const text = await titleLink.textContent();
  50 |       expect(text?.trim().length).toBeGreaterThan(0);
  51 |     }
  52 |   });
  53 | });
  54 | 
```