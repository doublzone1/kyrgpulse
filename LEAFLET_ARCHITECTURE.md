# 🏗️ Архитектура React Leaflet в Next.js 16

## 📊 Структура компонентов

```
┌─────────────────────────────────────────────────────────────┐
│                    Dashboard Page                            │
│                  (app/dashboard/page.tsx)                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ apartments data
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                      MapView.tsx                             │
│                  (Бизнес-логика)                             │
│                                                              │
│  • Группировка квартир по зонам (useMemo)                   │
│  • Определение зон по ключевым словам                       │
│  • Подсчёт неопределённых квартир                           │
│                                                              │
│  const LeafletMap = dynamic(                                │
│    () => import("./LeafletMap"),                            │
│    { ssr: false }                                           │
│  )                                                           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           │ { center, zoom, groups }
                           │ ssr: false (только браузер)
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                   LeafletMap.tsx                             │
│              (Client-only рендеринг)                         │
│                                                              │
│  import { MapContainer } from "react-leaflet"               │
│  import "leaflet/dist/leaflet.css"                          │
│  import L from "leaflet"                                    │
│                                                              │
│  • Инициализация иконок Leaflet                             │
│  • Рендеринг MapContainer                                   │
│  • Рендеринг TileLayer                                      │
│  • Рендеринг CircleMarker для каждой зоны                  │
│  • Рендеринг Popup с информацией                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 Поток данных

```
apartments[] (API)
    ↓
MapView.tsx
    ↓ useMemo
groups[] (зоны с квартирами)
    ↓ dynamic import (ssr: false)
LeafletMap.tsx
    ↓
MapContainer (Leaflet)
    ↓
CircleMarker[] (маркеры на карте)
```

---

## 🎯 Разделение ответственности

### MapView.tsx (Родительский компонент)

**Ответственность:**
- ✅ Бизнес-логика
- ✅ Обработка данных
- ✅ Группировка квартир
- ✅ Определение зон

**НЕ знает о:**
- ❌ Leaflet
- ❌ MapContainer
- ❌ Деталях рендеринга карты

**Код:**
```tsx
export default function MapView({ apartments }: Props) {
  // Бизнес-логика: группировка квартир по зонам
  const { groups, unknownCount } = useMemo(() => {
    const grouped = new Map<string, { zone: Zone; apartments: Apartment[] }>();
    // ... логика группировки
    return { groups: Array.from(grouped.values()), unknownCount: unknown };
  }, [apartments]);

  // Рендеринг: передача данных в LeafletMap
  return (
    <div>
      <p>Без распознанной зоны: {unknownCount}</p>
      <LeafletMap center={BISHKEK_CENTER} zoom={12} groups={groups} />
    </div>
  );
}
```

---

### LeafletMap.tsx (Client-only компонент)

**Ответственность:**
- ✅ Рендеринг карты
- ✅ Инициализация Leaflet
- ✅ Отображение маркеров
- ✅ Отображение popup

**НЕ знает о:**
- ❌ Квартирах
- ❌ Бизнес-логике
- ❌ Группировке данных

**Код:**
```tsx
export default function LeafletMap({ center, zoom, groups }: LeafletMapProps) {
  // Только рендеринг карты
  return (
    <MapContainer center={center} zoom={zoom}>
      <TileLayer url="..." />
      {groups.map(({ zone, apartments }) => (
        <CircleMarker key={zone.id} center={zone.position}>
          <Popup>
            {/* Отображение информации */}
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
```

---

## 🚫 Что НЕ делать (анти-паттерны)

### ❌ Анти-паттерн 1: Динамический импорт в useEffect

```tsx
// ПЛОХО
export default function MapView() {
  const [MapComponents, setMapComponents] = useState(null);
  
  useEffect(() => {
    import("react-leaflet").then(RL => {
      setMapComponents(RL);
    });
  }, []);
  
  if (!MapComponents) return <div>Loading...</div>;
  
  const { MapContainer } = MapComponents;
  return <MapContainer>...</MapContainer>;
}
```

**Проблемы:**
- Асинхронная загрузка в useEffect
- Дополнительный state
- Условный рендеринг
- Сложность отладки
- Не работает с StrictMode

---

### ❌ Анти-паттерн 2: useRef хаки

```tsx
// ПЛОХО
export default function MapView() {
  const mapInitialized = useRef(false);
  
  useEffect(() => {
    if (mapInitialized.current) return; // Хак для StrictMode
    mapInitialized.current = true;
    // ...
  }, []);
  
  return <MapContainer key="unique-key">...</MapContainer>; // key хак
}
```

**Проблемы:**
- Хаки вместо правильного решения
- Не решает корневую проблему
- Ломается при hot reload
- Сложно поддерживать

---

### ❌ Анти-паттерн 3: Отключение StrictMode

```tsx
// ПЛОХО
// next.config.mjs
const nextConfig = {
  reactStrictMode: false, // ❌ НЕ ДЕЛАЙТЕ ТАК
};
```

**Проблемы:**
- Скрывает проблемы вместо решения
- Теряете преимущества StrictMode
- Проблемы проявятся в production

---

### ❌ Анти-паттерн 4: CSS через <link> в компоненте

```tsx
// ПЛОХО
export default function MapView() {
  return (
    <div>
      <link rel="stylesheet" href="https://cdn.../leaflet.css" />
      <MapContainer>...</MapContainer>
    </div>
  );
}
```

**Проблемы:**
- CSS загружается при каждом рендере
- Не работает с CSS оптимизацией Next.js
- Может вызывать FOUC (Flash of Unstyled Content)

---

## ✅ Правильные паттерны

### ✅ Паттерн 1: Dynamic import с ssr: false

```tsx
// ХОРОШО
const LeafletMap = dynamic(() => import("./LeafletMap"), {
  ssr: false,
  loading: () => <div>Загрузка карты...</div>,
});

export default function MapView() {
  return <LeafletMap center={center} zoom={zoom} groups={groups} />;
}
```

**Преимущества:**
- Официальный паттерн Next.js
- Отключает SSR для компонента
- Работает с StrictMode
- Чистый код

---

### ✅ Паттерн 2: Прямой импорт в client-only компоненте

```tsx
// ХОРОШО
"use client";

import { MapContainer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export default function LeafletMap() {
  return <MapContainer>...</MapContainer>;
}
```

**Преимущества:**
- Синхронный импорт
- Нет дополнительного state
- Простой код
- Легко отлаживать

---

### ✅ Паттерн 3: Инициализация при импорте модуля

```tsx
// ХОРОШО
import L from "leaflet";

// Инициализация один раз при импорте модуля
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ ... });

export default function LeafletMap() {
  // Иконки уже настроены
  return <MapContainer>...</MapContainer>;
}
```

**Преимущества:**
- Выполняется один раз
- Нет useEffect
- Нет побочных эффектов в компоненте

---

## 🔍 Как работает dynamic import

### Шаг 1: Сервер (SSR)

```
Next.js Server
    ↓
MapView.tsx рендерится
    ↓
dynamic(() => import("./LeafletMap"), { ssr: false })
    ↓
LeafletMap НЕ рендерится (ssr: false)
    ↓
Отправляется HTML с placeholder
```

### Шаг 2: Браузер (Client)

```
Browser получает HTML
    ↓
React hydration
    ↓
MapView.tsx монтируется
    ↓
dynamic import загружает LeafletMap.tsx
    ↓
LeafletMap.tsx импортирует react-leaflet
    ↓
MapContainer создаёт Leaflet карту
    ↓
Карта отображается
```

### Шаг 3: StrictMode (Dev)

```
StrictMode включен
    ↓
React вызывает компоненты дважды
    ↓
MapView.tsx рендерится дважды ✅ (нет проблем)
    ↓
dynamic import возвращает тот же модуль ✅
    ↓
LeafletMap.tsx рендерится один раз ✅
    ↓
MapContainer создаётся один раз ✅
    ↓
Нет ошибки "already initialized" ✅
```

---

## 📦 Зависимости

```json
{
  "dependencies": {
    "leaflet": "^1.9.4",
    "react-leaflet": "^4.2.1",
    "@types/leaflet": "^1.9.14"
  }
}
```

**Важно:**
- `leaflet` - основная библиотека карт
- `react-leaflet` - React обёртка для Leaflet
- `@types/leaflet` - TypeScript типы

---

## 🧪 Тестирование

### Тест 1: Первая загрузка

```
1. Открыть http://localhost:3000/dashboard
2. Проверить: карта отображается
3. Проверить: нет ошибок в console
```

### Тест 2: StrictMode

```
1. Убедиться: reactStrictMode: true в next.config.mjs
2. Открыть страницу
3. Проверить: нет ошибки "already initialized"
```

### Тест 3: Hot Reload

```
1. Открыть страницу с картой
2. Изменить код в MapView.tsx
3. Сохранить файл
4. Проверить: карта обновилась без ошибок
```

### Тест 4: Навигация

```
1. Открыть dashboard
2. Перейти на главную страницу
3. Вернуться на dashboard
4. Проверить: карта работает, нет утечек памяти
```

---

## 📝 Checklist для внедрения

- [ ] Создан `LeafletMap.tsx` с прямыми импортами
- [ ] `MapView.tsx` использует `dynamic` с `ssr: false`
- [ ] Убраны `useEffect` с динамическими импортами
- [ ] Убраны `useState` для модулей
- [ ] Убраны `useRef` хаки
- [ ] Убраны `key` хаки у MapContainer
- [ ] Убраны `<link>` для CSS
- [ ] CSS импортируется через `import "leaflet/dist/leaflet.css"`
- [ ] `reactStrictMode: true` в next.config.mjs
- [ ] Проверено: карта работает без ошибок
- [ ] Проверено: hot reload работает
- [ ] Проверено: нет console errors

---

**Статус:** ✅ Архитектура правильная  
**Паттерн:** ✅ Официальный Next.js  
**StrictMode:** ✅ Совместимо
