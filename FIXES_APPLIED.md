# Исправления ошибок запуска KyrgPulse

## 🔧 Исправленные проблемы

### 1. Docker Compose - Windows Volume Mounts ✅

**Проблема:**
```
error while creating mount source path '/run/desktop/mnt/host/c/...'
```

**Причина:**
Docker на Windows с WSL2 неправильно обрабатывал короткий синтаксис bind mounts (`./backend:/app`), пытаясь создать абсолютные пути через `/run/desktop/mnt/host/`.

**Решение:**
Изменен синтаксис всех bind mounts на длинный формат с явным указанием типа:

```yaml
# Было:
volumes:
  - ./backend:/app

# Стало:
volumes:
  - type: bind
    source: ./backend
    target: /app
```

**Изменённые сервисы:**
- `backend` - bind mount для hot reload
- `celery-worker` - bind mount для hot reload
- `celery-beat` - bind mount для hot reload
- `frontend` - bind mount + anonymous volumes для node_modules и .next

### 2. React Leaflet - Двойная инициализация карты ✅

**Проблема:**
```
Error: Map container is already initialized
```

**Причина:**
React 19 + Next.js 16 с включенным `StrictMode` вызывает двойной рендер компонентов в dev режиме. MapContainer от react-leaflet не поддерживает повторную инициализацию на том же DOM элементе.

**Решение:**
1. Добавлен `useRef` для отслеживания инициализации
2. Убран `key` prop у MapContainer (он вызывал пересоздание)
3. Добавлена проверка `mapInitialized.current` в useEffect
4. Добавлен callback `whenReady` для корректной работы

```tsx
// Добавлено:
import { useRef } from "react";
const mapInitialized = useRef(false);

useEffect(() => {
  if (mapInitialized.current) return; // Предотвращаем повторную загрузку
  mapInitialized.current = true;
  // ... загрузка библиотек
}, []);

// Убрано:
<MapContainer key="bishkek-rent-map" ... />

// Стало:
<MapContainer ... whenReady={() => {}} />
```

## 📁 Изменённые файлы

1. **docker-compose.yml**
   - Исправлены все bind mounts на Windows-совместимый формат
   - Добавлены anonymous volumes для node_modules и .next

2. **frontend/components/MapView.tsx**
   - Добавлен useRef для предотвращения двойной инициализации
   - Убран key prop у MapContainer
   - Добавлен whenReady callback

## 🚀 Команды для запуска

### Первый запуск (с пересборкой):

```powershell
# Остановить и удалить старые контейнеры
docker compose down -v

# Собрать и запустить все сервисы
docker compose up --build
```

### Обычный запуск:

```powershell
docker compose up
```

### Запуск в фоне:

```powershell
docker compose up -d
```

### Проверка логов:

```powershell
# Все сервисы
docker compose logs -f

# Только frontend
docker compose logs -f frontend

# Только backend
docker compose logs -f backend
```

### Остановка:

```powershell
docker compose down
```

## ✅ Проверка работоспособности

После запуска `docker compose up --build`:

1. **Backend API**: http://localhost:8000
   - Swagger docs: http://localhost:8000/docs
   
2. **Frontend**: http://localhost:3000
   - Dashboard: http://localhost:3000/dashboard

3. **PostgreSQL**: localhost:5432
   - User: kyrgpulse
   - Password: kyrgpulse123
   - Database: kyrgpulse_db

4. **Redis**: localhost:6379

### Ожидаемое поведение:

✅ Все контейнеры запускаются без ошибок mount  
✅ Frontend открывается на порту 3000  
✅ Карта загружается и отображается без ошибок  
✅ Hot reload работает (изменения в коде применяются автоматически)  
✅ StrictMode остаётся включенным  

## 🐛 Если что-то не работает

### Docker mount ошибки:

```powershell
# Убедитесь, что Docker Desktop запущен
# Проверьте, что WSL2 включен
wsl --list --verbose

# Очистите Docker кеш
docker system prune -a
docker volume prune
```

### Frontend не запускается:

```powershell
# Пересоберите только frontend
docker compose build frontend --no-cache
docker compose up frontend
```

### Карта не отображается:

1. Откройте DevTools (F12)
2. Проверьте Console на ошибки
3. Убедитесь, что нет ошибок "Map container is already initialized"
4. Проверьте Network tab - должны загружаться тайлы карты

## 📝 Технические детали

### Docker volumes на Windows:

Docker Desktop на Windows использует WSL2 backend. Короткий синтаксис bind mounts иногда вызывает проблемы с путями. Длинный синтаксис с явным `type: bind` решает эту проблему.

### React Leaflet + StrictMode:

React 18+ в StrictMode намеренно вызывает компоненты дважды в dev режиме для выявления побочных эффектов. Leaflet создаёт императивный DOM и не может быть инициализирован дважды. Решение - использовать useRef для отслеживания состояния инициализации.

## 🎯 Dev Workflow

Workflow остался прежним:

1. Запустите `docker compose up`
2. Редактируйте код в `backend/` или `frontend/`
3. Изменения применяются автоматически (hot reload)
4. Не нужно перезапускать контейнеры

### Backend hot reload:
- Uvicorn с флагом `--reload` отслеживает изменения Python файлов

### Frontend hot reload:
- Next.js dev server автоматически перезагружает страницы

---

**Дата исправления:** 24 мая 2026  
**Версии:** Next.js 16.2.6, React 18, Docker Compose v2
