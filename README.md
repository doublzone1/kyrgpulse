# KyrgPulse

KyrgPulse - рабочий дашборд по долгосрочной аренде квартир в Бишкеке на основе объявлений lalafo.kg.

Проект умеет:

- парсить объявления lalafo.kg;
- очищать данные и загружать их в PostgreSQL;
- показывать статистику, список объявлений и распределение цен;
- обучать простую ML-модель прогноза цены;
- показывать карту приблизительных зон по тексту адреса.

## Важные ограничения

- В объявлениях нет надежных координат. Карта не показывает точные точки квартир, только приблизительные зоны по тексту адреса.
- `price_per_m2` считается только если площадь реально извлечена из объявления. Площадь больше не угадывается по числу комнат.
- ML-прогноз работает только после загрузки данных и обучения модели. Если модель не обучена, API вернет понятную ошибку, а не выдуманную уверенность.
- Валюты из объявлений приводятся к KGS при обработке данных. Если курс недоступен, используется резервный курс из backend.

## Стек

- Frontend: Next.js, React Query, Recharts, Leaflet, Tailwind CSS
- Backend: FastAPI, SQLAlchemy async, PostgreSQL
- Очереди: Celery + Redis
- Парсер: Playwright
- ML: scikit-learn RandomForestRegressor
- Запуск: Docker Compose

## Быстрый запуск

⚠️ **Важно для Windows:** Перед первым запуском выполните очистку старых данных:

```powershell
docker compose down -v
```

Затем запустите проект:

```powershell
docker compose up --build
```

Открыть:

- Frontend: http://localhost:3000
- Dashboard: http://localhost:3000/dashboard
- Swagger API: http://localhost:8000/docs

Файл `.env` создан автоматически с безопасными значениями по умолчанию. Для изменения настроек отредактируйте `.env`.

### Исправленные проблемы

✅ **PostgreSQL подключение** - имя БД `kyrgpulse_db` унифицировано везде  
✅ **Windows mount errors** - убраны bind mounts для стабильности  
✅ **React Leaflet карта** - исправлена двойная инициализация  

📚 Подробности: `START_HERE.md`, `DATABASE_FIX.md`, `CHANGES_SUMMARY.md`

## Загрузка данных

После запуска контейнеров:

```powershell
.\scripts\parse.ps1
```

Скрипт выполняет три шага:

1. Парсит объявления lalafo.kg.
2. Обрабатывает данные и загружает их в PostgreSQL.
3. Пытается обучить ML-модель.

Те же команды вручную:

```powershell
docker exec -it kyrgpulse-backend python -m parsers.lalafo_parser
docker exec -it kyrgpulse-backend python -m processors.data_processor
Invoke-RestMethod -Method Post -Uri http://localhost:8000/api/analytics/train-model
```

## Настройки

Основные переменные в `.env`:

- `POSTGRES_DB` - имя базы данных, по умолчанию `kyrgpulse_db`;
- `POSTGRES_USER` - пользователь PostgreSQL, по умолчанию `kyrgpulse`;
- `POSTGRES_PASSWORD` - пароль PostgreSQL, по умолчанию `kyrgpulse123`;
- `POSTGRES_HOST` - хост PostgreSQL, по умолчанию `postgres`;
- `POSTGRES_PORT` - порт PostgreSQL, по умолчанию `5432`;
- `CITY` - город в URL lalafo.kg, по умолчанию `bishkek`;
- `MAX_PAGES` - число страниц для парсинга;
- `HEADLESS` и `SLOW_MO` - режим Playwright;
- `CORS_ORIGINS` - разрешенные origins frontend, без wildcard при cookies/credentials;
- `NEXT_PUBLIC_API_URL` - URL backend API для frontend.

⚠️ **Важно:** Все сервисы (backend, celery-worker, celery-beat) должны использовать одинаковое значение `POSTGRES_DB=kyrgpulse_db`.

## Проверка

```powershell
docker compose ps
docker logs kyrgpulse-backend -f
docker logs kyrgpulse-frontend -f
```

API healthcheck:

```powershell
Invoke-RestMethod http://localhost:8000/health
```

## Генерируемые файлы

Эти файлы не должны попадать в репозиторий:

- `frontend/node_modules/`
- `frontend/.next/`
- `backend/__pycache__/`, `*.pyc`
- `backend/celerybeat-schedule*`
- `backend/data/raw/*`
- `backend/data/processed/*`
- `backend/data/models/*`
- `.env`
