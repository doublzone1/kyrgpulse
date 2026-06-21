# 🚀 Быстрый старт KyrgPulse

## ⚡ Запуск за 2 команды

```powershell
# 1. Очистить старые данные
docker compose down -v

# 2. Запустить проект
docker compose up --build
```

---

## 🌐 Открыть в браузере

После запуска (подождите 30-60 секунд):

- **Frontend:** http://localhost:3000
- **Dashboard:** http://localhost:3000/dashboard
- **API Docs:** http://localhost:8000/docs
- **Health Check:** http://localhost:8000/health

---

## ✅ Что исправлено

1. ✅ **PostgreSQL подключение** - имя БД `kyrgpulse_db` везде
2. ✅ **Windows mount errors** - убраны bind mounts
3. ✅ **React Leaflet карта** - исправлена двойная инициализация
4. ✅ **Переменные окружения** - создан `.env` файл

---

## 🐛 Если не работает

```powershell
# Полная очистка и перезапуск
docker compose down -v
docker system prune -a
docker compose up --build
```

---

## 📚 Подробная документация

- `DATABASE_FIX.md` - исправление проблемы с PostgreSQL
- `FIXES_APPLIED.md` - все исправления (Docker + React Leaflet)
- `QUICK_START.md` - быстрый старт после исправлений

---

## ⚠️ Важно

**Hot reload отключен** (для стабильности на Windows).  
При изменении кода нужно пересобрать контейнеры:

```powershell
docker compose up --build
```

Для разработки с hot reload запускайте backend/frontend локально:

```powershell
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

---

**Готово! Проект должен запуститься без ошибок.** 🎉
