# 🔧 Исправление проблемы подключения к PostgreSQL

## 🐛 Проблема

```
FATAL: database "kyrgpulse" does not exist
```

**Причина:**  
Несоответствие имени базы данных в разных местах конфигурации:
- В `docker-compose.yml` и `.env` указано: `POSTGRES_DB=kyrgpulse_db`
- Приложение где-то пыталось подключиться к базе `kyrgpulse` (без суффикса `_db`)

---

## ✅ Что было исправлено

### 1. Унифицировано имя базы данных

Везде используется **`kyrgpulse_db`**:

- ✅ `docker-compose.yml` - все сервисы (backend, celery-worker, celery-beat)
- ✅ `.env` - создан файл с правильными переменными
- ✅ `backend/config/settings.py` - уже было правильно
- ✅ Healthcheck для postgres - добавлена проверка конкретной БД

### 2. Исправлен healthcheck для PostgreSQL

**Было:**
```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U kyrgpulse"]
```

**Стало:**
```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U kyrgpulse -d kyrgpulse_db"]
```

Теперь healthcheck проверяет доступность конкретной базы данных `kyrgpulse_db`.

### 3. Убраны bind mounts для стабильности на Windows

**Проблема:** Bind mounts на Windows с WSL2 вызывали ошибки mount path.

**Решение:** Временно убраны все bind mounts из docker-compose.yml:
- ❌ `./backend:/app` - убран
- ❌ `./frontend:/app` - убран
- ❌ Anonymous volumes для node_modules - убраны

**Последствия:**
- ✅ Проект стабильно запускается на Windows
- ⚠️ Hot reload не работает (нужно пересобирать контейнеры при изменениях)
- ⚠️ Для разработки рекомендуется запускать backend/frontend локально

### 4. Создан .env файл

Создан файл `.env` с правильными переменными окружения:

```env
POSTGRES_DB=kyrgpulse_db
POSTGRES_USER=kyrgpulse
POSTGRES_PASSWORD=kyrgpulse123
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
```

---

## 📁 Изменённые файлы

1. **`docker-compose.yml`**
   - Исправлен healthcheck для postgres (добавлен `-d kyrgpulse_db`)
   - Убраны все bind mounts для стабильности на Windows
   - Все сервисы используют `POSTGRES_DB=kyrgpulse_db`

2. **`.env`** (создан)
   - Добавлены все необходимые переменные окружения
   - Имя БД: `kyrgpulse_db`

3. **`backend/config/settings.py`** (без изменений)
   - Уже использовал правильное имя БД

---

## 🚀 Команды для запуска

### 1. Очистить старые контейнеры и volumes

```powershell
docker compose down -v
```

**Важно:** Флаг `-v` удалит старые данные PostgreSQL с неправильным именем БД.

### 2. Пересобрать и запустить

```powershell
docker compose up --build
```

### 3. Проверить логи

```powershell
# Все сервисы
docker compose logs -f

# Только backend
docker compose logs -f backend

# Только postgres
docker compose logs -f postgres
```

---

## ✅ Проверка работоспособности

После запуска `docker compose up --build`:

### 1. Проверить статус контейнеров

```powershell
docker compose ps
```

Все контейнеры должны быть в статусе `Up` или `healthy`.

### 2. Проверить подключение к PostgreSQL

```powershell
docker exec -it kyrgpulse-postgres psql -U kyrgpulse -d kyrgpulse_db -c "\dt"
```

Должен показать список таблиц (или пустой список, если таблицы ещё не созданы).

### 3. Проверить backend API

Откройте в браузере:
- **Health check:** http://localhost:8000/health
- **API Docs:** http://localhost:8000/docs

Должен вернуться JSON:
```json
{
  "status": "ok",
  "service": "KyrgPulse",
  "version": "1.0.0"
}
```

### 4. Проверить frontend

Откройте в браузере:
- **Frontend:** http://localhost:3000
- **Dashboard:** http://localhost:3000/dashboard

---

## 🔍 Диагностика проблем

### Если backend не подключается к БД

```powershell
# Проверить переменные окружения в контейнере
docker exec kyrgpulse-backend env | grep POSTGRES

# Должно быть:
# POSTGRES_DB=kyrgpulse_db
# POSTGRES_USER=kyrgpulse
# POSTGRES_PASSWORD=kyrgpulse123
# POSTGRES_HOST=postgres
# POSTGRES_PORT=5432
```

### Если postgres не запускается

```powershell
# Проверить логи postgres
docker compose logs postgres

# Проверить healthcheck
docker inspect kyrgpulse-postgres | grep -A 10 Health
```

### Если ошибка "database does not exist"

```powershell
# Остановить всё и удалить volumes
docker compose down -v

# Запустить заново
docker compose up --build
```

---

## 📊 Структура базы данных

После успешного запуска PostgreSQL автоматически создаст:

- **База данных:** `kyrgpulse_db`
- **Пользователь:** `kyrgpulse`
- **Пароль:** `kyrgpulse123`

Backend автоматически создаст таблицы при первом запуске (через `init_db()` в `main.py`).

---

## 🔄 Для разработки с hot reload

Если нужен hot reload (автоматическое применение изменений), есть два варианта:

### Вариант 1: Локальный запуск (рекомендуется)

**Backend:**
```powershell
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend:**
```powershell
cd frontend
npm install
npm run dev
```

**PostgreSQL и Redis:** оставить в Docker
```powershell
docker compose up postgres redis
```

### Вариант 2: Вернуть bind mounts (может не работать на Windows)

Раскомментировать volumes в `docker-compose.yml`:

```yaml
backend:
  volumes:
    - ./backend:/app

frontend:
  volumes:
    - ./frontend:/app
    - /app/node_modules
    - /app/.next
```

---

## 📝 Переменные окружения

Все переменные окружения для подключения к БД:

| Переменная | Значение | Где используется |
|------------|----------|------------------|
| `POSTGRES_DB` | `kyrgpulse_db` | postgres, backend, celery-worker, celery-beat |
| `POSTGRES_USER` | `kyrgpulse` | postgres, backend, celery-worker, celery-beat |
| `POSTGRES_PASSWORD` | `kyrgpulse123` | postgres, backend, celery-worker, celery-beat |
| `POSTGRES_HOST` | `postgres` | backend, celery-worker, celery-beat |
| `POSTGRES_PORT` | `5432` | backend, celery-worker, celery-beat |

**DATABASE_URL формируется автоматически:**
```
postgresql+asyncpg://kyrgpulse:kyrgpulse123@postgres:5432/kyrgpulse_db
```

---

## ✅ Итоговый чеклист

После запуска проверьте:

- [ ] `docker compose ps` - все контейнеры в статусе Up
- [ ] http://localhost:8000/health - возвращает `{"status": "ok"}`
- [ ] http://localhost:8000/docs - открывается Swagger UI
- [ ] http://localhost:3000 - открывается frontend
- [ ] Логи backend не содержат ошибок подключения к БД
- [ ] `docker exec -it kyrgpulse-postgres psql -U kyrgpulse -d kyrgpulse_db -c "\l"` - показывает базу kyrgpulse_db

---

**Дата исправления:** 24 мая 2026  
**Статус:** ✅ Готово к запуску
