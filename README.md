# 🐕 Dog Walks

Учёт прогулок с собакой на двоих: кто гулял, сколько и когда.

Прод: http://103.76.53.197/ (закрыт паролем)

---

## Что умеет

- Недельный календарь: 7 дней × 3 слота (утро / день / вечер)
- Дневной вид — удобнее с телефона
- Четыре состояния слота: Андрей 🔵 / Ира 🟣 / Оба 🟢 / Никто ⬜
- Длительность прогулки в минутах и комментарий
- Статистика за произвольный период
- Экспорт в CSV

## Стек

| Слой | Технология |
|---|---|
| Frontend | React 18 + Vite |
| Backend | Node.js + Express |
| База | SQLite (`better-sqlite3`) |
| Хостинг | Yandex Cloud, Ubuntu 22.04 |
| Проксирование | nginx |
| Процесс-менеджер | PM2 |

Версия Node зафиксирована в [`.nvmrc`](.nvmrc) — одна и та же локально, в CI и на сервере.

## Структура

```
.
├── .github/workflows/   CI и автодеплой
├── code/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── db.js           подключение к SQLite
│   │   │   ├── migrations.js   версионированные миграции
│   │   │   ├── app.js          Express-приложение (без запуска порта)
│   │   │   └── server.js       запуск, чтение переменных окружения
│   │   └── tests/              тесты API и миграций
│   └── frontend/
│       └── src/
│           ├── components/
│           └── services/
├── docs/                аудит и пошаговые инструкции
└── scripts/             деплой
```

Бэкенд разделён так, чтобы `app.js` можно было импортировать в тесты и подсунуть ему базу в памяти. Порт слушает только `server.js`.

---

## Запуск локально

Нужен Node версии из `.nvmrc`:

```bash
nvm use
```

Установка и первый запуск:

```bash
cd code/backend
cp .env.example .env
npm install
npm run dev
```

В другом окне:

```bash
cd code/frontend
npm install
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:3000/api

База создастся сама при первом старте, миграции применятся автоматически.

## Тесты

```bash
cd code/backend
npm test          # разовый прогон
npm run test:watch # в режиме наблюдения
```

Тесты работают с базой в оперативной памяти и реальных данных не трогают.

---

## Как вносить изменения

`main` защищён, напрямую в него не пушим. Любая правка едет через ветку и Pull Request.

```bash
git checkout main && git pull
git checkout -b feature/название

# ...правки...

cd code/backend && npm test
git add -A
git commit -m "feat: что сделал"
git push -u origin feature/название
```

Дальше открыть PR, дождаться зелёного CI, влить. После вливания:

```bash
git checkout main && git pull
git branch -d feature/название
```

Префиксы коммитов: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`.

---

## API

Все эндпоинты кроме `/api/health` закрыты Basic Auth на уровне nginx.

| Метод | Endpoint | Описание |
|---|---|---|
| `GET` | `/api/health` | Статус сервиса, используется автодеплоем |
| `GET` | `/api/walks?from=&to=` | Прогулки за период |
| `PUT` | `/api/walks/:date/:slot` | Записать, кто гулял |
| `GET` | `/api/stats?from=&to=` | Статистика за период |
| `GET` | `/api/export?from=&to=` | Выгрузка в CSV |

Даты в формате `YYYY-MM-DD`. Слоты: `morning`, `afternoon`, `evening`. Значения `person`: `andrey`, `ira`, `both`, `none`. Длительность — от 0 до 480 минут.

### Схема данных

Таблица `walks`:

| Поле | Тип | Описание |
|---|---|---|
| `id` | INTEGER PK | авто-инкремент |
| `walk_date` | TEXT | дата `YYYY-MM-DD` |
| `slot` | TEXT | `morning` / `afternoon` / `evening` |
| `person` | TEXT | `andrey` / `ira` / `both` / `none` |
| `duration` | INTEGER | минуты |
| `comments` | TEXT | комментарий |
| `updated_at` | TEXT | время последнего изменения |

Уникальность по паре `(walk_date, slot)` — на один слот одна запись.

### Миграции

Схема версионируется через `PRAGMA user_version`. Миграции лежат в `code/backend/src/migrations.js` и применяются при старте сервера: база сама знает, на каком она шаге, и докатывает недостающее.

Новые миграции добавляются **только в конец** массива. Уже существующие менять нельзя — они применены на проде, и правка задним числом разведёт схемы.

---

## Переменные окружения

| Переменная | Назначение | По умолчанию |
|---|---|---|
| `PORT` | порт бэкенда | `3000` |
| `DB_PATH` | путь к файлу SQLite | `./database/walks.db` |
| `APP_VERSION` | версия в ответе `/api/health` | `dev` |

Локально задаются в `code/backend/.env` (не коммитится, шаблон — `.env.example`). На сервере — через `ecosystem.config.cjs` для PM2.

---

## Документация

| Документ | О чём |
|---|---|
| [docs/AUDIT-AND-ROADMAP.md](docs/AUDIT-AND-ROADMAP.md) | Аудит уязвимостей и план работ по фазам |
| [docs/PHASE-0-RUNBOOK.md](docs/PHASE-0-RUNBOOK.md) | Аварийные меры: ротация ключей, закрытие API |
| [docs/PHASE-1-2-RUNBOOK.md](docs/PHASE-1-2-RUNBOOK.md) | Процесс разработки, тесты, CI, автодеплой, бэкапы |

---

## Лицензия

MIT
