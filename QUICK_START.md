# 🚀 Быстрый старт после исправлений

## Что было исправлено

### ✅ Проблема 1: Docker mount error на Windows
**Ошибка:** `error while creating mount source path '/run/desktop/mnt/host/c/...'`

**Исправление:** Изменён формат volume mounts в `docker-compose.yml` с короткого на длинный синтаксис, совместимый с Windows + WSL2.

### ✅ Проблема 2: React Leaflet двойная инициализация
**Ошибка:** `Error: Map container is already initialized`

**Исправление:** Добавлен `useRef` в `MapView.tsx` для предотвращения повторной инициализации карты при React StrictMode.

---

## 📋 Команды для запуска

### 1. Первый запуск (обязательно):

```powershell
docker compose down -v
docker compose up --build
```

### 2. Обычный запуск:

```powershell
docker compose up
```

### 3. Запуск в фоне:

```powershell
docker compose up -d
```

---

## 🌐 Проверка работы

После запуска откройте:

- **Frontend:** http://localhost:3000
- **Dashboard:** http://localhost:3000/dashboard  
- **API Docs:** http://localhost:8000/docs

---

## ✅ Что должно работать

- ✅ Docker контейнеры запускаются без ошибок
- ✅ Frontend открывается на порту 3000
- ✅ Карта отображается без ошибок
- ✅ Hot reload работает (изменения применяются автоматически)
- ✅ StrictMode включен (не отключали)

---

## 📁 Изменённые файлы

1. `docker-compose.yml` - исправлены volume mounts для Windows
2. `frontend/components/MapView.tsx` - исправлена двойная инициализация карты

---

## 🐛 Если не работает

```powershell
# Очистить всё и начать заново
docker compose down -v
docker system prune -a
docker compose up --build
```

---

**Готово! Проект должен запуститься без ошибок.**
