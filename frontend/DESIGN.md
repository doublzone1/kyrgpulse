# KyrgPulse — Design System

Тёмный, спокойный дашборд аналитики недвижимости.  
Акцент на данных, минимум визуального шума.

---

## Color Palette

### Surfaces (фоны и разделители)

| Token | Hex | Использование |
|---|---|---|
| `surface-page` | `#09090b` | Фон страницы |
| `surface-card` | `#18181b` | Карточки, панели |
| `surface-raised` | `#27272a` | Приподнятые элементы, поповеры |
| `surface-overlay` | `#3f3f46` | Hover-заливки, тултипы |
| `surface-border` | `rgba(255,255,255,0.07)` | Тонкий разделитель |
| `surface-border-strong` | `rgba(255,255,255,0.13)` | Видимая граница |

### Primary — Teal (основной бренд)

| Token | Hex | Использование |
|---|---|---|
| `primary-300` | `#5eead4` | Яркий highlight, иконки |
| `primary-400` | `#2dd4bf` | Hover, интерактив |
| `primary-500` | `#14b8a6` | **Базовый цвет бренда** |
| `primary-600` | `#0d9488` | Pressed, тёмный акцент |
| `primary-700` | `#0f766e` | Глубокий тон |

### Accent — Amber (CTA и выделения данных)

| Token | Hex | Использование |
|---|---|---|
| `accent-400` | `#fbbf24` | Hover |
| `accent-500` | `#f59e0b` | **CTA-кнопки, ключевые метрики** |
| `accent-600` | `#d97706` | Pressed |

> Amber используется экономно — не более 1–2 элементов на экран.

### Status (ценовые тренды)

| Token | Hex | Смысл |
|---|---|---|
| `status-up` | `#22c55e` | Рост цен, позитивный тренд |
| `status-down` | `#f43f5e` | Падение, негативный |
| `status-neutral` | `#71717a` | Нет изменений |
| `status-warn` | `#f59e0b` | Предупреждение |
| `status-info` | `#3b82f6` | Информационный |

### Chart Palette (визуализация данных)

Использовать строго в этом порядке для последовательных рядов:

| # | Token | Hex |
|---|---|---|
| 1 | `chart-1` | `#14b8a6` — teal |
| 2 | `chart-2` | `#f59e0b` — amber |
| 3 | `chart-3` | `#3b82f6` — blue |
| 4 | `chart-4` | `#8b5cf6` — violet |
| 5 | `chart-5` | `#f43f5e` — rose |
| 6 | `chart-6` | `#22c55e` — green |

> Не смешивать более 4 цветов в одном графике.

---

## Typography

Три роли — каждая своя функция:

| Класс | Шрифт | Применение |
|---|---|---|
| `font-display` | Manrope | Заголовки h1–h4, `letter-spacing: -0.02em` |
| `font-body` / `font-sans` | Inter | Основной текст, интерфейсные надписи |
| `font-numeric` | Space Grotesk | Цены, числовые показатели, `tabular-nums` |

### Шкала размеров

| Размер | px | Использование |
|---|---|---|
| `text-2xs` | 10px | Микро-лейблы, timestamps |
| `text-xs` | 12px | Подписи, категории, uppercase-лейблы |
| `text-sm` | 14px | Основной текст интерфейса |
| `text-base` | 16px | Тело, длинные описания |
| `text-lg` | 18px | Акцентный текст |
| `text-xl` | 20px | Подзаголовки |
| `text-2xl` | 24px | Числовые показатели карточек |
| `text-3xl` | 30px | Заголовки секций |
| `text-4xl+` | 36px+ | Только hero / display |

---

## Spacing

База: **4px**. Ключевые шаги:

| Tailwind | px | Использование |
|---|---|---|
| `gap-2` / `p-2` | 8px | Иконка + текст, значок |
| `p-3` | 12px | Мелкие кнопки, бейджи |
| `p-4` | 16px | Базовый отступ |
| `p-6` | 24px | Паддинг карточки (стандарт) |
| `p-8` | 32px | Большие секции |
| `gap-6` | 24px | Между карточками в сетке |
| `gap-3` | 12px | Мелкие элементы в ряду |

---

## Border Radius

| Token | px | Использование |
|---|---|---|
| `rounded-sm` | 4px | Бейджи, чипы, теги |
| `rounded` / `rounded-md` | 6–8px | Инпуты, кнопки |
| `rounded-lg` | 12px | Карточки, панели (**стандарт**) |
| `rounded-xl` | 16px | Модальные окна, большие панели |
| `rounded-full` | 9999px | Пилюли, аватары, точки |

---

## Shadows

| Token | Использование |
|---|---|
| `shadow-card` | Статичная карточка |
| `shadow-card-hover` | Карточка при hover |
| `shadow-dropdown` | Выпадающие меню, поповеры |
| `shadow-glow-primary` | Фокус/акцент на primary-элементах (экономно) |
| `shadow-glow-accent` | Акцент на amber CTA (экономно) |
| `shadow-inset-top` | Верхний блик стеклянной карточки |

---

## Component Classes (globals.css)

| Класс | Описание |
|---|---|
| `.glass` | Стеклянная карточка с backdrop-blur и teal-бордером |
| `.glass-hover` | Анимация hover для `.glass` |
| `.font-display` | Manrope, tight letter-spacing |
| `.font-numeric` | Space Grotesk, tabular-nums |
| `.neon-text` | Градиентный текст teal→amber (только logo/hero) |
| `.mountain-bg` | Фон страницы с мягким teal-сиянием |
| `.pulse-dot` | Анимированная teal-точка (live-индикатор) |

---

## Do / Don't

**Do:**
- Использовать `primary-500` для интерактивных состояний и бренд-акцентов
- Применять `accent-500` только для CTA и 1–2 ключевых метрик на экран
- Цены — всегда `font-numeric` с `tabular-nums`
- `status-up` / `status-down` — единственный источник истины для трендов
- Держать не более 3–4 цветов в графике

**Don't:**
- Не смешивать `text-cyan-*`, `text-teal-*`, `rgb(var(--pulse-*))` и `text-primary-*` в новом коде — используй токены Tailwind
- Не использовать яркие `primary-300` / `accent-300` для фоновых заливок
- Не добавлять `.neon-text` вне hero-заголовков
- Не добавлять более 6 цветов в `chart.*`
