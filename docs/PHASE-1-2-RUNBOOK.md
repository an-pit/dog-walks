# Фазы 1-2 — процесс разработки и выкатки

Структура с папкой `code/` сохраняется. Все пути ниже это учитывают.

---

## Что получится в итоге

```
локально: ветка feature/*  →  коммит  →  push
                                          ↓
                              Pull Request на GitHub
                                          ↓
                              CI: тесты + сборка фронта
                                          ↓
                                   merge в main
                                          ↓
                        автодеплой: pull → миграции → сборка → reload
                                          ↓
                              smoke-тест /api/health
                                          ↓
                          прошёл → готово   /   упал → автооткат
```

Ключевая идея: **в прод попадает только то, что лежит в `main`**, и попадает туда автоматически. Руками на сервере больше ничего не правится. Ровно это чинит расхождение с полем `comments`, которое мы нашли при аудите.

Работы примерно на 3-4 вечера. Блоки 1-3 можно сделать за один заход, дальше по одному блоку.

---

# Блок 1. Привести репозиторий в порядок

Порядок внутри блока важен: переписывание истории в 1.4 делает force-push, поэтому оно должно случиться до появления веток и PR.

## 1.1. Перевыпустить GitHub-токен

Сейчас токен вшит прямо в адрес репозитория и лежит открытым текстом в `.git/config`.

**На GitHub:** Settings (личные, не репозитория) → Developer settings → Personal access tokens → Fine-grained tokens. Найдите текущий токен и нажмите **Revoke**.

Создайте новый: **Generate new token**.

- Token name: `dog-walks-local`
- Expiration: 90 дней
- Repository access: **Only select repositories** → `an-pit/dog-walks`
- Permissions → Repository permissions → **Contents: Read and write**

Больше ничего не выдавайте. Смысл fine-grained токена в том, что он умеет ровно одно и только в одном репозитории — если утечёт, ущерб ограничен.

Скопируйте токен, он показывается один раз.

**Уберите токен из URL:**

```bash
cd ~/путь/к/dog-walks-app
git remote set-url origin https://github.com/an-pit/dog-walks.git
git remote -v
```

Теперь в выводе не должно быть ничего похожего на `github_pat_...`.

**Настройте нормальное хранение.** macOS умеет держать учётные данные в Keychain:

```bash
git config --global credential.helper osxkeychain
```

При следующем `git push` спросят логин и пароль. Логин — `an-pit`, пароль — **новый токен** (не пароль от GitHub). Keychain запомнит, больше вводить не придётся, и в открытом виде токен нигде лежать не будет.

## 1.2. Зафиксировать перестройку в `code/`

Сейчас git видит перенос как «все файлы удалены, появилась неотслеживаемая папка». Надо закоммитить, иначе дальше запутаемся.

```bash
git add -A
git status
```

В `git status` посмотрите на строки — git должен распознать перенос как `renamed:`, например `renamed: backend/src/server.js -> code/backend/src/server.js`. Если он показывает пары `deleted` + `new file` — не страшно, содержимое то же самое, git просто не сматчил.

```bash
git commit -m "refactor: перенести код в папку code/"
git push origin main
```

## 1.3. Удалить файлы ключа

```bash
git rm 'ssh-keygen -t ed25519 -C "andrey.pit@gmail.com"' \
       'ssh-keygen -t ed25519 -C "andrey.pit@gmail.com".pub'
git rm --cached .DS_Store code/.DS_Store code/frontend/.DS_Store
git commit -m "chore: убрать ключи и .DS_Store из репозитория"
git push origin main
```

Это убирает их из текущего состояния. Из истории — следующим шагом.

## 1.4. Вычистить ключ из истории

```bash
brew install git-filter-repo

cd ~
git clone https://github.com/an-pit/dog-walks.git dog-walks-clean
cd dog-walks-clean

git filter-repo \
  --path 'ssh-keygen -t ed25519 -C "andrey.pit@gmail.com"' \
  --path 'ssh-keygen -t ed25519 -C "andrey.pit@gmail.com".pub' \
  --invert-paths
```

Проверка — должно вывести `0`:

```bash
git log --all --oneline --name-only | grep -c "ssh-keygen"
```

`filter-repo` удаляет remote нарочно, чтобы вы не запушили переписанную историю случайно. Возвращаем и пушим осознанно:

```bash
git remote add origin https://github.com/an-pit/dog-walks.git
git push origin --force --all
```

**С этого момента работаем в `dog-walks-clean`.** Старую папку не удаляйте пару недель, но и не трогайте — её история разошлась с GitHub. Скопируйте туда только документы: `AUDIT-AND-ROADMAP.md`, `PHASE-0-RUNBOOK.md`, `PHASE-1-2-RUNBOOK.md`, `dog-walks-manual.md`.

## 1.5. Закрыть дыру на будущее

Создайте `.gitignore` в корне (дополните существующий):

```
# Ключи и секреты
*.pem
*.key
id_rsa*
id_ed25519*
*ssh-keygen*
.env
.env.*
!.env.example

# Базы
*.db
*.db-shm
*.db-wal

# OS
.DS_Store
```

На GitHub: репозиторий → **Settings** → **Advanced Security** → включите **Secret scanning** и **Push protection**. Push protection блокирует пуш, если внутри найден похожий на секрет текст. Для публичных репозиториев бесплатно, и именно это поймало бы ключ ещё в апреле.

---

# Блок 2. Локальное окружение

## 2.1. Вынести путь к базе в переменную окружения

Сейчас путь к базе зашит в коде, а сама база лежит внутри папки проекта. Это опасно: при автодеплое `git reset --hard` может её снести. Выносим наружу.

Нужны два файла рядом друг с другом:

| Файл | Что в нём | Попадает в git |
|---|---|---|
| `.env.example` | шаблон с именами переменных и безопасными значениями | **да** |
| `.env` | реальные значения этой конкретной машины | **нет**, закрыт `.gitignore` |

Смысл пары такой: `.env.example` показывает, какие переменные вообще нужны приложению, чтобы через полгода не гадать. А `.env` у каждого свой — у вас локально путь один, на сервере другой, и в репозиторий он не попадает.

Перейдите в папку бэкенда:

```bash
cd /Users/pitushkin/Yandex.Disk.localized/Claude/projects/dog-walks-app/code/backend
```

Создайте шаблон:

```bash
cat > .env.example << 'EOF'
# Порт, на котором слушает бэкенд
PORT=3000

# Путь к файлу базы SQLite.
# Локально — внутри проекта, на сервере — /var/lib/dog-walks/walks.db
DB_PATH=./database/walks.db
EOF
```

Здесь `>` (перезаписать), а не `>>` (дописать), потому что файла ещё нет и мы создаём его с нуля. Кавычки вокруг `EOF` не дают bash трогать содержимое.

Теперь рабочий файл. Раз значения пока совпадают с шаблоном, проще скопировать:

```bash
cp .env.example .env
```

Проверьте, что оба на месте и с нужным содержимым:

```bash
ls -la .env .env.example
cat .env
```

Убедитесь, что `.env` действительно закрыт от git, а `.env.example` — нет:

```bash
git check-ignore -v .env
git check-ignore -v .env.example
```

Читать вывод надо по знаку `!` в начале правила, а не по факту наличия строки:

```
.gitignore:145:.env            .env           ← правило обычное → файл игнорируется
.gitignore:147:!.env.example   .env.example   ← правило с «!» → файл НЕ игнорируется
```

С флагом `-v` git печатает любое сработавшее правило, включая отрицающие, и в обоих случаях возвращает код 0. Поэтому молчания от второй команды ждать не надо — наоборот, строка с `!.env.example` означает, что исключение на месте и всё настроено верно.

> Без `-v` поведение другое: `git check-ignore .env.example` ничего не выведет и вернёт код 1 именно потому, что файл не игнорируется. Легко перепутать эти два режима.

Самая надёжная проверка — посмотреть, что git реально готов положить в коммит:

```bash
cd /Users/pitushkin/Yandex.Disk.localized/Claude/projects/dog-walks-app
git add -A
git status --short
```

В списке должен быть `code/backend/.env.example` и **не должно быть** `code/backend/.env`. Это окончательный ответ: `git status` показывает фактическое поведение, а не теоретическое совпадение правил.

Если `.env` всё-таки виден — уберите его из индекса и разберитесь с `.gitignore`, не коммитьте:

```bash
git restore --staged code/backend/.env
```

```bash
git commit -m "chore: шаблон переменных окружения для бэкенда"
```

Node 18 читает `.env` сам, через флаг `--env-file` — он уже прописан в скрипте `dev` в разделе 2.3. Отдельная библиотека вроде `dotenv` не нужна.

> На сервере `.env` не понадобится: там переменные задаются через `ecosystem.config.cjs` в блоке 6.2, это способ PM2.

## 2.2. Разложить бэкенд на части

Сейчас весь бэкенд — один `server.js`, который при импорте сразу поднимает сервер на порту. Протестировать такое нельзя: тест импортирует файл и немедленно получает занятый порт. Разделяем на четыре файла.

**`code/backend/src/db.js`** — подключение к базе:

```js
import Database from 'better-sqlite3';

export function openDb(dbPath) {
  const db = new Database(dbPath);
  // WAL заметно улучшает поведение при одновременном чтении и записи
  db.pragma('journal_mode = WAL');
  return db;
}
```

**`code/backend/src/migrations.js`** — версионированные миграции:

```js
// Каждая функция — один шаг. Добавлять только в конец, не менять существующие.
const migrations = [
  // v1: исходная таблица
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS walks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        walk_date TEXT NOT NULL,
        slot TEXT NOT NULL CHECK (slot IN ('morning', 'afternoon', 'evening')),
        person TEXT NOT NULL CHECK (person IN ('andrey', 'ira', 'both', 'none')),
        duration INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(walk_date, slot)
      )
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_walks_date ON walks(walk_date)');
  },

  // v2: комментарии — то, чего не хватает на проде
  (db) => {
    const cols = db.pragma('table_info(walks)');
    if (!cols.some((c) => c.name === 'comments')) {
      db.exec("ALTER TABLE walks ADD COLUMN comments TEXT DEFAULT ''");
    }
  },
];

export function migrate(db) {
  const current = db.pragma('user_version', { simple: true });

  for (let i = current; i < migrations.length; i++) {
    db.transaction(() => {
      migrations[i](db);
      db.pragma(`user_version = ${i + 1}`);
    })();
    console.log(`✅ Применена миграция v${i + 1}`);
  }

  if (current === migrations.length) {
    console.log('✅ База актуальна');
  }
}
```

SQLite хранит в себе число `user_version`. Мы используем его как счётчик применённых миграций: база знает, на каком она шаге, и `migrate` докатывает недостающие. Каждая миграция в транзакции — упала на середине, откатилась целиком.

Проверка на существование колонки в v2 нужна потому, что ваша локальная база, возможно, уже её имеет, а прод — нет. Миграция должна отработать корректно в обоих случаях.

**`code/backend/src/app.js`** — приложение без запуска сервера. Перенесите сюда все четыре эндпоинта из `server.js` без изменений, обернув в функцию:

```js
import express from 'express';
import cors from 'cors';

export function createApp(db) {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '100kb' }));

  // ...сюда целиком переезжают четыре существующих обработчика,
  // заменив обращения к глобальному db на аргумент функции

  // health-check для автодеплоя
  app.get('/api/health', (req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.json({ status: 'ok', version: process.env.APP_VERSION || 'dev' });
    } catch (e) {
      res.status(500).json({ status: 'error' });
    }
  });

  return app;
}
```

**`code/backend/src/server.js`** — теперь только запуск:

```js
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb } from './db.js';
import { migrate } from './migrations.js';
import { createApp } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'database', 'walks.db');
const PORT = process.env.PORT || 3000;

const db = openDb(dbPath);
migrate(db);

createApp(db).listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}, база: ${dbPath}`);
});
```

Старый `migrate.js` удалите — миграции теперь прогоняются при старте сервера автоматически.

## 2.3. Скрипты

`code/backend/package.json`:

```json
"scripts": {
  "dev": "node --watch --env-file=.env src/server.js",
  "start": "node src/server.js",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

## 2.4. Согласовать версию Node

На вашей машине Node 24, на сервере — Node 18. Это разрыв, который рано или поздно даст «у меня работает, а на проде нет». Приводим к одному знаменателю.

Node 18 снят с поддержки и не получает патчей безопасности. Node 24 с марта 2026 — Active LTS, поддержка до апреля 2028. Берём его на обеих сторонах.

Зафиксируйте версию в репозитории — файл `.nvmrc` в корне:

```bash
cd /Users/pitushkin/Yandex.Disk.localized/Claude/projects/dog-walks-app
echo "24" > .nvmrc
```

Теперь `nvm use` в этой папке будет сам переключаться на нужную версию, а CI сможет прочитать её из файла вместо того, чтобы дублировать номер в конфиге.

**`better-sqlite3` тоже надо поднять.** Версия 9.x вышла в 2023 году и не имеет готовых бинарников под Node 24 — npm пытается собрать её из исходников и падает на `error: "C++20 or later required."`. Начиная с 12.0.0 готовые бинарники под Node 24 есть, собирать ничего не нужно. В `package.json` уже проставлено `^12.10.0`.

Обновление сервера на Node 24 — в блоке 6.0.

## 2.5. Создать lock-файлы — обязательный шаг

В репозитории сейчас **нет ни одного `package-lock.json`**. Это тихая мина под будущий CI: `npm ci` из блока 5 без lock-файла просто откажется работать с ошибкой `npm ci can only install packages when your package.json and package-lock.json are in sync`.

Lock-файл фиксирует точные версии всех зависимостей, включая вложенные. Без него `npm install` на вашей машине, в CI и на сервере может поставить разные версии, и «у меня работает» перестаёт что-либо значить.

```bash
cd code/backend && npm install
cd ../frontend && npm install
```

Проверьте, что файлы появились и не игнорируются:

```bash
cd /Users/pitushkin/Yandex.Disk.localized/Claude/projects/dog-walks-app
ls code/backend/package-lock.json code/frontend/package-lock.json
git status --short
```

Оба `package-lock.json` должны быть видны в `git status`. Их обязательно коммитить — это часть исходного кода, а не мусор сборки.

## 2.6. Проверить, что всё работает

```bash
cd code/backend && npm test
npm run dev
```

В другом окне:

```bash
cd code/frontend && npm install && npm run dev
```

Откройте localhost:5173, покликайте. Если работает — фундамент готов.

---

# Блок 3. Ветки и Pull Requests

## 3.1. Модель

Одна долгоживущая ветка `main` — это ровно то, что сейчас в проде. Всё остальное живёт в коротких ветках и вливается через PR.

Имена веток по смыслу:

| Префикс | Для чего | Пример |
|---|---|---|
| `feature/` | новая функциональность | `feature/dark-theme` |
| `fix/` | исправление бага | `fix/timezone-offset` |
| `chore/` | инфраструктура, зависимости | `chore/add-ci` |

## 3.2. Защита main

Репозиторий → **Settings** → **Rules** → **Rulesets** → **New branch ruleset**.

- Ruleset Name: `protect-main`
- Enforcement status: **Active**
- Target branches → Add target → **Include default branch**
- Отметьте:
  - **Restrict deletions**
  - **Block force pushes**
  - **Require a pull request before merging** → Required approvals: **0**
  - **Require status checks to pass** → сюда добавим `test` после Блока 5

Ноль аппрувов — потому что вы один. Смысл PR для одиночки не в чужом ревью, а в том, что перед вливанием вы видите полный диф своих изменений и результат тестов. Это ловит опечатки и забытые `console.log` лучше, чем кажется.

**Важно:** галку `Do not allow bypassing the above settings` пока не ставьте — иначе автодеплой не сможет пушить, если понадобится. Вернёмся к этому, когда всё заработает.

## 3.3. Цикл на каждый день

```bash
# 1. Обновиться и создать ветку
git checkout main
git pull
git checkout -b fix/timezone-offset

# 2. Поработать, посмотреть что изменилось
git status
git diff

# 3. Закоммитить
git add -A
git commit -m "fix: считать дату по локальному времени, а не UTC"

# 4. Отправить
git push -u origin fix/timezone-offset
```

`-u` нужен только при первом пуше ветки — он связывает локальную ветку с удалённой, дальше хватает просто `git push`.

Дальше в терминале появится ссылка вида `https://github.com/an-pit/dog-walks/pull/new/fix/timezone-offset`. Откройте её, нажмите **Create pull request**, дождитесь зелёной галки от CI, нажмите **Merge**. После merge:

```bash
git checkout main
git pull
git branch -d fix/timezone-offset
```

Сообщения к коммитам — префикс и суть в повелительном наклонении: `fix:`, `feat:`, `chore:`, `refactor:`, `test:`, `docs:`. Через полгода вы скажете себе спасибо, читая `git log`.

---

# Блок 4. Тесты

## 4.1. Установка

```bash
cd code/backend
npm install -D vitest supertest
```

## 4.2. Первые тесты

Создайте `code/backend/tests/api.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { openDb } from '../src/db.js';
import { migrate } from '../src/migrations.js';
import { createApp } from '../src/app.js';

let app;

beforeEach(() => {
  // ':memory:' — база в оперативной памяти, живёт только внутри теста.
  // Реальные данные не трогаются, каждый тест начинается с чистого листа.
  const db = openDb(':memory:');
  migrate(db);
  app = createApp(db);
});

describe('GET /api/walks', () => {
  it('требует параметры from и to', async () => {
    const res = await request(app).get('/api/walks');
    expect(res.status).toBe(400);
  });

  it('отклоняет кривую дату', async () => {
    const res = await request(app).get('/api/walks?from=не-дата&to=2026-08-01');
    expect(res.status).toBe(400);
  });

  it('возвращает пустой список, когда данных нет', async () => {
    const res = await request(app).get('/api/walks?from=2026-08-01&to=2026-08-02');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('PUT /api/walks/:date/:slot', () => {
  it('создаёт запись', async () => {
    const res = await request(app)
      .put('/api/walks/2026-08-01/morning')
      .send({ person: 'andrey', duration: 45, comments: 'дождь' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('перезаписывает существующую запись, а не плодит дубли', async () => {
    await request(app).put('/api/walks/2026-08-01/morning').send({ person: 'andrey', duration: 30 });
    await request(app).put('/api/walks/2026-08-01/morning').send({ person: 'ira', duration: 50 });

    const res = await request(app).get('/api/walks?from=2026-08-01&to=2026-08-01');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].person).toBe('ira');
    expect(res.body[0].duration).toBe(50);
  });

  it('отклоняет неизвестный слот', async () => {
    const res = await request(app).put('/api/walks/2026-08-01/ночь').send({ person: 'andrey' });
    expect(res.status).toBe(400);
  });

  it('отклоняет отрицательную длительность', async () => {
    const res = await request(app)
      .put('/api/walks/2026-08-01/morning')
      .send({ person: 'andrey', duration: -10 });
    expect(res.status).toBe(400);
  });

  it('отклоняет длительность больше суток', async () => {
    const res = await request(app)
      .put('/api/walks/2026-08-01/morning')
      .send({ person: 'andrey', duration: 9999 });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/stats', () => {
  it('засчитывает прогулку both обоим', async () => {
    await request(app).put('/api/walks/2026-08-01/morning').send({ person: 'both', duration: 60 });

    const res = await request(app).get('/api/stats?from=2026-08-01&to=2026-08-01');
    expect(res.body.statistics.andrey).toBe(1);
    expect(res.body.statistics.ira).toBe(1);
    expect(res.body.statistics.andreyDuration).toBe(60);
    expect(res.body.statistics.iraDuration).toBe(60);
  });
});

describe('GET /api/health', () => {
  it('отвечает ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
```

```bash
npm test
```

Все должны пройти. Если какой-то падает — это уже находка: значит поведение отличается от ожидаемого, и стоит разобраться, кто прав, тест или код.

## 4.3. Что тестировать дальше

Правило простое: **каждый раз, когда находите баг, сначала пишете тест, который его воспроизводит.** Тест красный — значит вы поняли проблему. Чините — тест зелёный. Так баг не вернётся.

Первый кандидат — история с часовым поясом из аудита.

---

# Блок 5. CI на GitHub Actions

Создайте `.github/workflows/ci.yml` в **корне репозитория**, не внутри `code/`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'

      - name: Установить зависимости бэкенда
        working-directory: code/backend
        run: npm ci

      - name: Прогнать тесты
        working-directory: code/backend
        run: npm test

      - name: Собрать фронтенд
        working-directory: code/frontend
        run: |
          npm ci
          npm run build
```

Разбор:

- `on: pull_request` — запускать при каждом PR; `push: branches: [main]` — и после вливания
- `runs-on: ubuntu-latest` — GitHub поднимает чистую виртуалку под каждый запуск
- `actions/checkout@v4` — выкачивает ваш код в эту виртуалку
- `npm ci` вместо `npm install` — ставит строго по `package-lock.json`, без самовольных обновлений. Для CI это правильный вариант
- Сборка фронта здесь не ради артефакта, а как проверка: если в JSX опечатка, сборка упадёт и вы узнаете об этом до прода

Закоммитьте через ветку и PR — заодно обкатаете процесс:

```bash
git checkout -b chore/add-ci
git add .github/workflows/ci.yml
git commit -m "chore: добавить CI с тестами и сборкой"
git push -u origin chore/add-ci
```

Откройте PR — внизу появится блок с прогоном. Дождитесь галки, влейте.

После первого успешного прогона вернитесь в **Settings → Rules → protect-main** и добавьте `test` в **Require status checks to pass**. Теперь красный тест физически не даст влить PR.

---

# Блок 6. Подготовить сервер

> ⚠️ **Порядок шагов внутри блока строгий.** Код обновляется раньше Node, а Node раньше пересборки модулей. Если сначала поднять Node до 24, сервер окажется в состоянии «новый Node + старый `better-sqlite3` 9.x», а эта версия под Node 24 не собирается — приложение встанет.

## 6.0. Бэкап и остановка

```bash
ssh dogwalks
cp /opt/dog-walks-app/backend/database/walks.db ~/walks-backup-$(date +%Y%m%d_%H%M).db
ls -lh ~/walks-backup-*.db
```

Скопируйте бэкап и к себе на машину — на сервере он от гибели диска не спасёт:

```bash
scp dogwalks:~/walks-backup-*.db ~/dog-walks-backups/
```

Останавливаем приложение на время работ:

```bash
pm2 stop dog-walks-backend
```

## 6.1. Забрать новый код

Делаем это **до** обновления Node: в новом коде уже прописан `better-sqlite3` 12.x, который под Node 24 ставится из готовых бинарников без компиляции.

```bash
cd /opt/dog-walks-app
git remote set-url origin https://github.com/an-pit/dog-walks.git
git fetch origin
git reset --hard origin/main
ls
```

Должны появиться папки `code/`, `docs/`, `.github/` и файл `.nvmrc`.

> `git reset --hard` перезаписывает всё содержимое папки. База пока лежит внутри неё, в `backend/database/` — именно поэтому шагом раньше мы сняли бэкап, а в 6.3 вынесем базу наружу навсегда.

## 6.2. Обновить Node до 24

Node 18 снят с поддержки и не получает патчей безопасности.

```bash
node --version        # покажет v18.x
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version        # должно стать v24.x
```

Теперь ставим зависимости заново. Нативные модули привязаны к версии Node, поэтому старый `node_modules` надо снести целиком, а не досоздавать:

```bash
cd /opt/dog-walks-app/code/backend
rm -rf node_modules
npm ci --omit=dev
```

Проверьте, что нативный модуль действительно загружается:

```bash
node -e "import('better-sqlite3').then(m=>{const d=new m.default(':memory:');console.log('модуль OK');d.close()}).catch(e=>console.error('СЛОМАН:',e.message))"
```

Ожидаем `модуль OK`. Ошибки вида `NODE_MODULE_VERSION` или `invalid ELF header` означают, что бинарник остался от старой версии Node — повторите `rm -rf node_modules && npm ci --omit=dev`.

Соберите фронтенд:

```bash
cd /opt/dog-walks-app/code/frontend
npm ci && npm run build
```

## 6.3. Вынести базу из папки проекта

Автодеплой делает `git reset --hard`, и рано или поздно это снесёт базу, лежащую внутри репозитория. Переносим наружу.

**Убедитесь, что бэкап из 6.0 у вас есть** — `ls -lh ~/walks-backup-*.db` должен что-то показать.

База переживает `git reset --hard`: она в `.gitignore`, а git трогает только отслеживаемые файлы. Поэтому после 6.1 файл всё ещё лежит по старому пути, откуда мы его и забираем:

```bash
ls -lh /opt/dog-walks-app/backend/database/walks.db

sudo mkdir -p /var/lib/dog-walks
sudo mv /opt/dog-walks-app/backend/database/walks.db /var/lib/dog-walks/
sudo chown -R ubuntu:ubuntu /var/lib/dog-walks
ls -lh /var/lib/dog-walks/
```

Проверьте, что база целая и данные на месте. Для этого нужна консольная утилита `sqlite3` — она не ставится вместе с Node, потому что приложение работает через библиотеку `better-sqlite3`, которой командная строка не нужна. Дальше она пригодится в Блоке 8 для бэкапов, так что ставим:

```bash
sudo apt install sqlite3 -y
sqlite3 /var/lib/dog-walks/walks.db "SELECT COUNT(*) FROM walks;"
```

Ожидаем число около 260.

> Если ставить не хочется, то же самое можно спросить через уже установленную библиотеку:
>
> ```bash
> cd /opt/dog-walks-app/code/backend
> node -e "import('better-sqlite3').then(m=>{const d=new m.default('/var/lib/dog-walks/walks.db');console.log(d.prepare('SELECT COUNT(*) AS n FROM walks').get());d.close()})"
> ```

Старую пустую папку можно убрать:

```bash
rm -rf /opt/dog-walks-app/backend
```

## 6.4. Обновить пути в PM2 и nginx

Код теперь лежит в `code/`, база — в `/var/lib/dog-walks/`. Переучиваем оба сервиса.

### PM2

> ✅ **Уже сделано.** `ecosystem.config.cjs` лежит в `main`. Заново создавать и коммитить его не нужно — проверьте и переходите к nginx:
>
> ```bash
> head -8 ecosystem.config.cjs
> ```
>
> Если видите строку `// Конфигурация PM2 для прода.` — всё на месте.

Файл `ecosystem.config.cjs` живёт **в репозитории и едет на сервер через git**, а не пишется руками на сервере. В этом весь смысл: конфигурация перестаёт быть чем-то, что существует в единственном экземпляре на VM и теряется при её пересоздании.

Расширение именно `.cjs`, а не `.js`: в `package.json` указан `"type": "module"`, поэтому все `.js` в проекте считаются ES-модулями, а PM2 ждёт CommonJS с `module.exports`. Расширение `.cjs` явно говорит Node читать файл как CommonJS.

Содержимое для справки:

```js
module.exports = {
  apps: [
    {
      name: 'dog-walks-backend',
      script: './code/backend/src/server.js',
      cwd: '/opt/dog-walks-app',

      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',

      // Логи с отметками времени — иначе непонятно, когда что случилось
      time: true,

      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        // База вынесена за пределы репозитория: деплой делает git reset --hard,
        // и внутри папки проекта она бы однажды не пережила выкатку
        DB_PATH: '/var/lib/dog-walks/walks.db',
      },
    },
  ],
};
```

Забрать файл на сервере:

```bash
ssh dogwalks
cd /opt/dog-walks-app
git fetch origin && git reset --hard origin/main
head -8 ecosystem.config.cjs
```

Теперь конфигурация PM2 живёт в git, а не только на сервере: при пересоздании VM она приедет сама, а история изменений видна в коммитах.

> **Если правите файл в будущем** — только через ветку и PR, как любой другой код, и **только в одной ветке за раз**. Если положить один и тот же новый файл в две параллельные ветки, он приедет в `main` двумя путями, и второй PR встретит конфликт на ровном месте.

### nginx

Конфигурация nginx, наоборот, живёт на сервере — она относится к машине, а не к коду. Правим на месте:

```bash
sudo nano /etc/nginx/sites-available/dog-walks
```

Поправьте `root` на новый путь с `code/` и добавьте исключение для health-check:

```nginx
server {
    listen 80;
    server_name 103.76.53.197;

    auth_basic "Dog Walks";
    auth_basic_user_file /etc/nginx/.htpasswd;

    # health-check без пароля — иначе автодеплой не сможет проверить,
    # что сервис поднялся. Отдаёт только статус, данных не раскрывает.
    location = /api/health {
        auth_basic off;
        proxy_pass http://localhost:3000;
    }

    location / {
        root /opt/dog-walks-app/code/frontend/dist;
        try_files $uri $uri/ /index.html;
        index index.html;
    }

    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## 6.5. Ключ для автодеплоя

GitHub Actions нужен свой способ зайти на сервер. Личный ключ туда класть нельзя — заводим отдельный, только для деплоя.

**На своей машине:**

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/dogwalks_deploy -N ""
```

`-N ""` — пустой passphrase. Для автоматики это обязательно: некому вводить пароль. Именно поэтому ключ отдельный и с ограниченной ролью.

Публичную часть на сервер:

```bash
cat ~/.ssh/dogwalks_deploy.pub | ssh dogwalks "cat >> ~/.ssh/authorized_keys"
```

Проверьте:

```bash
ssh -i ~/.ssh/dogwalks_deploy ubuntu@103.76.53.197 "echo сработало"
```

**Приватную часть — в GitHub Secrets.** Репозиторий → Settings → Secrets and variables → Actions → **New repository secret**:

| Name | Secret |
|---|---|
| `DEPLOY_SSH_KEY` | вывод `cat ~/.ssh/dogwalks_deploy` — целиком, вместе со строками BEGIN и END |
| `DEPLOY_HOST` | `103.76.53.197` |
| `DEPLOY_USER` | `ubuntu` |

Скопировать ключ в буфер: `pbcopy < ~/.ssh/dogwalks_deploy`

Секреты в GitHub шифруются и в логах Actions автоматически замазываются звёздочками. Прочитать их обратно через интерфейс нельзя — только перезаписать.

## 6.6. Запустить и проверить

Код, зависимости и конфиги уже на месте — осталось поднять приложение под новым описанием PM2. Старую запись удаляем: в ней зашиты прежние путь и переменные окружения, `restart` их не обновит.

```bash
cd /opt/dog-walks-app
pm2 delete dog-walks-backend
pm2 start ecosystem.config.cjs
pm2 save
```

`pm2 save` записывает текущий список процессов, чтобы после перезагрузки VM приложение поднялось само.

Проверки по возрастанию охвата — от бэкенда наружу:

```bash
# 1. Бэкенд отвечает напрямую
curl -s http://localhost:3000/api/health; echo

# 2. Данные на месте и миграция применилась (в ответе должно быть поле comments)
curl -s "http://localhost:3000/api/walks?from=2026-08-01&to=2026-08-04"; echo

# 3. Health доступен снаружи без пароля
curl -s http://103.76.53.197/api/health; echo

# 4. Остальное снаружи требует пароль
curl -I "http://103.76.53.197/api/walks?from=2026-08-01&to=2026-08-04"
```

Ожидаем: `{"status":"ok","version":"dev"}`, затем JSON с прогулками, снова `ok`, и наконец `401 Unauthorized`.

Логи, если что-то пошло не так:

```bash
pm2 logs dog-walks-backend --lines 50 --nostream
```

В логах при первом запуске должны быть строки вида `✅ Применена миграция v1` и `v2` — это докатилась недостающая колонка `comments`. При последующих запусках будет `✅ База актуальна`.

И финальная проверка — откройте http://103.76.53.197/ в браузере, введите пароль, покликайте по слотам. Комментарии теперь должны сохраняться: до этого момента прод их терял, потому что колонки в базе не было.

---

# Блок 7. Автодеплой

> ✅ **Файлы уже созданы** в вашей рабочей папке: `scripts/deploy.sh` и `.github/workflows/deploy.yml`. Читать их содержимое полезно, но набирать заново не нужно — сразу переходите к 7.3.

**Где что живёт.** Оба файла лежат **в репозитории**, а не пишутся руками на сервере:

| Файл | Где хранится | Где выполняется |
|---|---|---|
| `.github/workflows/deploy.yml` | репозиторий | на серверах GitHub |
| `scripts/deploy.sh` | репозиторий | на вашей VM |

`deploy.sh` попадает на сервер двумя путями сразу. Во-первых, GitHub Actions читает его из склонированного репозитория и передаёт по SSH на выполнение — то есть выполняется всегда та версия, что лежит в `main`. Во-вторых, после первой же выкатки файл окажется и на диске сервера вместе с остальным кодом, так что его можно запустить руками, если понадобится.

## 7.1. Скрипт деплоя

Лежит в `scripts/deploy.sh`. Что он делает по шагам:

1. Запоминает текущий коммит — это точка отката
2. Забирает свежий `main`
3. Ставит зависимости бэкенда, собирает фронтенд
4. `pm2 reload` — новый процесс поднимается до того, как гаснет старый, поэтому простоя почти нет. Миграции применяются сами при старте `server.js`
5. До десяти раз с интервалом 2 секунды дёргает `/api/health`
6. Если health так и не ответил — возвращает предыдущий коммит, пересобирает и перезапускает

Первая строка после комментариев — `set -euo pipefail`. Она важнее, чем кажется: без неё скрипт продолжит работу после падения `npm ci` и радостно «задеплоит» сломанное.

## 7.2. Workflow

Лежит в `.github/workflows/deploy.yml`. Две задачи:

- `test` — прогоняет тесты заново, уже на слитом состоянии `main`. Зелёный CI на ветке не гарантирует, что после merge всё цело: ветка могла быть собрана до чужих изменений
- `deploy` — с `needs: test`, поэтому без зелёных тестов не стартует. Кладёт ключ из секретов, ходит по SSH, скармливает серверу `deploy.sh`, затем проверяет `/api/health` снаружи через nginx

`ssh-keyscan` перед подключением нужен, чтобы ssh не спросил «доверяете ли вы этому хосту?» — в автоматике отвечать на такой вопрос некому, и без этой строки задача просто повиснет.

## 7.3. Отправить в репозиторий

Сначала убедитесь, что 6.5 сделан: три секрета `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER` должны быть в Settings → Secrets and variables → Actions. Без них выкатка упадёт на шаге подключения.

Дальше как любое изменение — через ветку и PR:

```bash
cd /Users/pitushkin/Yandex.Disk.localized/Claude/projects/dog-walks-app
git checkout main && git pull
git checkout -b chore/autodeploy
```

Проверьте, что у скрипта стоит флаг исполняемости — git его запоминает, и без него сервер откажется запускать файл:

```bash
ls -l scripts/deploy.sh
```

В начале строки должно быть `-rwxr-xr-x` (важна буква `x`). Если её нет:

```bash
chmod +x scripts/deploy.sh
```

Коммитим и отправляем:

```bash
git add scripts/deploy.sh .github/workflows/deploy.yml
git status --short
git commit -m "chore: автодеплой на push в main"
git push -u origin chore/autodeploy
```

В `git status` должны быть ровно два файла. Дальше — открыть PR, дождаться зелёного `test`, влить.

## 7.4. Первая выкатка

Как только PR влит, `deploy.yml` окажется в `main` — и push в `main`, которым он туда попал, сам же и запустит первую выкатку.

Откройте вкладку **Actions** и смотрите на запуск **Deploy**. Разверните шаг «Выкатить»: там будет вывод скрипта с сервера, с теми самыми `▶` и `✅`.

**Первый раз почти наверняка что-нибудь упадёт.** Самые частые причины:

| Что в логе | Что делать |
|---|---|
| `Permission denied (publickey)` | Публичная часть ключа не попала в `~/.ssh/authorized_keys` на сервере, либо в секрет `DEPLOY_SSH_KEY` скопирована не вся приватная часть — она должна включать строки `-----BEGIN` и `-----END` |
| `Host key verification failed` | Не отработал `ssh-keyscan`; проверьте, что `DEPLOY_HOST` содержит только IP, без `http://` и без слэша |
| `Permission denied` при `git reset` | Файлы в `/opt/dog-walks-app` принадлежат не `ubuntu`. Почините: `sudo chown -R ubuntu:ubuntu /opt/dog-walks-app` |
| `pm2: command not found` | PM2 стоит глобально для интерактивной сессии, а неинтерактивный SSH не подхватывает PATH. Лечится строкой `export PATH=$PATH:/usr/local/bin` в начале `deploy.sh` |
| `deploy.sh: Permission denied` | Забыт `chmod +x` перед коммитом |

Логи подробные — покажите вывод, разберём.

## 7.5. Проверить, что цикл замкнулся

Настоящая проверка — провести через новый процесс безобидное изменение и увидеть его на проде:

```bash
git checkout main && git pull
git checkout -b test/deploy-check
```

Поменяйте что-нибудь заметное и безвредное — например, заголовок в `code/frontend/index.html`. Затем:

```bash
git add -A
git commit -m "test: проверка автодеплоя"
git push -u origin test/deploy-check
```

PR → зелёный CI → merge. Дальше ничего руками не делаете: смотрите Actions, ждёте зелёного Deploy, обновляете http://103.76.53.197/ и видите правку.

С этого момента прод обновляется сам, а расхождение между `main` и сервером — то самое, из-за которого поле `comments` месяцами не доезжало, — становится невозможным.

---

# Блок 8. Бэкапы

Сейчас бэкапов нет. Год статистики прогулок живёт в одном файле на одном диске одной виртуалки — восстановить его будет неоткуда.

Делаем в два уровня: ежедневный снимок на сервере и копия в Object Storage, чтобы пережить гибель самой VM.

> ⚠️ Команды `s3cmd --configure`, `crontab -e` и `htpasswd` интерактивные. Запускайте их **по одной**, не вставляя блоком: следующая строка будет съедена как ответ на приглашение.

## 8.1. Скрипт бэкапа

Утилита `sqlite3` уже стоит (ставили в 6.3). Она нужна именно ради `.backup` — это единственный способ снять согласованный снимок SQLite: обычный `cp` во время записи может дать битый файл, потому что часть данных лежит в WAL-журнале.

```bash
sudo nano /opt/backup-dogwalks.sh
```

```bash
#!/usr/bin/env bash
set -euo pipefail

DB=/var/lib/dog-walks/walks.db
BACKUP_DIR=/var/backups/dog-walks
STAMP=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/walks_$STAMP.db"

mkdir -p "$BACKUP_DIR"

# .backup корректно работает при активной записи, в отличие от cp
sqlite3 "$DB" ".backup '$FILE'"

# Проверяем, что снимок не битый, до того как на него положимся
if ! sqlite3 "$FILE" "PRAGMA integrity_check;" | grep -q '^ok$'; then
  echo "❌ Бэкап повреждён: $FILE" >&2
  rm -f "$FILE"
  exit 1
fi

COUNT=$(sqlite3 "$FILE" "SELECT COUNT(*) FROM walks;")
gzip "$FILE"
echo "✅ $STAMP — записей: $COUNT, файл: ${FILE}.gz"

# Локально держим 30 дней
find "$BACKUP_DIR" -name "walks_*.db.gz" -mtime +30 -delete
```

```bash
sudo chmod +x /opt/backup-dogwalks.sh
sudo /opt/backup-dogwalks.sh
```

Ожидаем строку вида `✅ 20260805_141500 — записей: 263, файл: ...`. Число записей — важная часть: если однажды оно резко упадёт, вы это заметите в логе.

## 8.2. Копия в Object Storage

Бэкап на том же диске не спасает от гибели диска. Уносим наружу.

### Создать бакет

Прямая ссылка на раздел в вашем каталоге:

https://console.yandex.cloud/folders/b1gbthcnlnff5leli313/storage

> На дашборде консоли Object Storage в списке «Ресурсы» не появится, пока в нём ничего не создано — этот блок показывает только используемые сервисы. Если ссылка не подходит, воспользуйтесь полем «Поиск сервисов» на дашборде или кнопкой «Создать ресурс» → **Бакет**.

Нажмите **Создать бакет**.

- Имя: `dog-walks-backups-<что-нибудь-уникальное>` (имена глобальные на всё облако)
- Максимальный размер: 1 ГБ хватит с большим запасом
- Доступ на чтение объектов, на список объектов, на чтение настроек: **Ограниченный**
- Класс хранилища: **Холодное** — оно дешевле, а бэкапы читаются редко

### Сервисный аккаунт

Отдельная учётная запись только для загрузки бэкапов. Ваши личные права в неё не попадают.

Прямая ссылка: https://console.yandex.cloud/folders/b1gbthcnlnff5leli313/iam/service-accounts

1. **Создать сервисный аккаунт**
   - Имя: `dog-walks-backup`
   - Роль: `storage.uploader` — умеет только загружать объекты, ни читать, ни удалять

### Статический ключ доступа

У сервисного аккаунта бывает три вида ключей, и для S3 годится **только один**. Это самая частая ошибка на этом шаге.

| Тип ключа | Для чего | Подходит |
|---|---|---|
| API-ключ | вызовы API отдельных сервисов | ❌ |
| Авторизованный ключ | JSON-файл, для получения IAM-токенов | ❌ |
| **Статический ключ доступа** | S3-совместимый доступ | ✅ |

Откройте созданный аккаунт → **Создать новый ключ** → **Создать статический ключ доступа**.

Появится окно с **двумя** значениями, и оба понадобятся:

| Что показала консоль | Как выглядит | Куда пойдёт в `~/.s3cfg` |
|---|---|---|
| **Идентификатор** | ~25 символов, начинается с `YCAJ` | `access_key` |
| **Секретный ключ** | ~40 символов, начинается с `YC` | `secret_key` |

**Скопируйте оба сразу** — секрет показывается один раз и больше нигде не отображается. Если потеряли, ключ не восстановить: надо удалить и создать новый.

### Настроить s3cmd на сервере

```bash
sudo apt install s3cmd -y
```

Конфиг пишем файлом, а не через интерактивный `s3cmd --configure` — так надёжнее и повторяемо:

```bash
nano ~/.s3cfg
```

Подставьте значения из предыдущего шага **вместо заглушек целиком**, вместе с текстом `ВАШ_...`:

```ini
[default]
access_key = ВАШ_ИДЕНТИФИКАТОР
secret_key = ВАШ_СЕКРЕТНЫЙ_КЛЮЧ
bucket_location = ru-central1
host_base = storage.yandexcloud.net
host_bucket = %(bucket)s.storage.yandexcloud.net
use_https = True
```

Следите, чтобы после `=` не осталось лишних пробелов, а в конце строк — переводов строки, прилетевших вместе с копированием.

Права на файл — внутри секрет:

```bash
chmod 600 ~/.s3cfg
```

Проверьте, что значения имеют правильный вид. Команда показывает только длину и первые символы, сами ключи не раскрывает:

```bash
awk -F'=' '/^(access_key|secret_key)/ {v=$2; gsub(/^[ \t]+|[ \t]+$/,"",v); print $1"— длина:", length(v), "| начало:", substr(v,1,4)}' ~/.s3cfg
```

Ожидаем что-то вроде:

```
access_key — длина: 25 | начало: YCAJ
secret_key — длина: 40 | начало: YCP2
```

Если `access_key` начинается с `aje` — вы подставили идентификатор самого сервисного аккаунта, а не ключа.

### Проверить

Проверяем **загрузкой, а не списком**:

```bash
echo "проверка $(date)" > /tmp/s3test.txt
s3cmd put /tmp/s3test.txt s3://dog-walks-backups-ваше-имя/
```

Успешная загрузка и есть подтверждение: именно это сервер будет делать каждую ночь. Объект видно в консоли облака, внутри бакета.

> **Не проверяйте через `s3cmd ls`.** Роль `storage.uploader` намеренно не даёт читать список объектов, и запрос вернёт ошибку — часто `400 BadRequest` вместо ожидаемого `403`. Это не поломка конфигурации, а работающее ограничение прав: если сервер взломают, скачать или стереть бэкапы с него не смогут. Содержимое бакета смотрите в консоли.

Если **`put` тоже даёт ошибку**, смотрите, что именно отвечает сервер:

```bash
s3cmd put /tmp/s3test.txt s3://dog-walks-backups-ваше-имя/ --debug 2>&1 | tail -30
```

В конце вывода будет XML с причиной. Как читать:

| Что в ответе | Что это значит |
|---|---|
| `<access_key_id>not a valid value</access_key_id>` | подставлен не тот ключ — скорее всего создан API-ключ или авторизованный вместо статического |
| `SignatureDoesNotMatch` | неверный `secret_key` либо в него попал лишний символ |
| `AccessDenied` | ключ верный, но у аккаунта нет роли `storage.uploader` на этот бакет |
| `NoSuchBucket` | опечатка в имени бакета |

### Добавить загрузку в скрипт

```bash
sudo nano /opt/backup-dogwalks.sh
```

Перед строкой с `find` вставьте:

```bash
# Копия за пределы сервера.
# -c с явным путём обязателен: скрипт идёт под root (через sudo или cron),
# а ~/.s3cfg лежит у пользователя ubuntu. Без этого s3cmd будет искать
# конфиг в /root и не найдёт ключей.
if s3cmd -c /home/ubuntu/.s3cfg put "${FILE}.gz" "s3://dog-walks-backups-ваше-имя/"; then
  echo "☁️  Загружено в Object Storage"
else
  echo "⚠️  Не удалось загрузить в Object Storage" >&2
fi
```

Загрузка намеренно не роняет скрипт: локальный бэкап уже снят, и это ценнее, чем аккуратный код возврата. Вывод `s3cmd` тоже не глушим — если однажды сломается, причина должна быть видна в логе, а не спрятана в `/dev/null`.

```bash
sudo /opt/backup-dogwalks.sh
```

Ожидаем **две** строки:

```
✅ 20260805_163616 — записей: 269, файл: /var/backups/dog-walks/walks_20260805_163616.db.gz
☁️  Загружено в Object Storage
```

Если вместо второй пришло `⚠️`, посмотрите строки `s3cmd` над ней — там будет причина. Проверить отдельно, что дело именно в правах и путях, можно так:

```bash
sudo s3cmd -c /home/ubuntu/.s3cfg put /tmp/s3test.txt s3://dog-walks-backups-ваше-имя/
```

### Автоудаление старых копий

Чтобы бакет не рос бесконечно: бакет → **Жизненный цикл** → **Создать правило**.

- Действие: удалять объекты старше **90** дней

Так вы не платите за копии, которые уже никогда не понадобятся.

## 8.3. Расписание

```bash
sudo crontab -e
```

Если спросит редактор, выберите `nano` (вариант 1). Добавьте строку в конец:

```
0 3 * * * /opt/backup-dogwalks.sh >> /var/log/dogwalks-backup.log 2>&1
```

Пять полей — минута, час, день месяца, месяц, день недели. `0 3 * * *` означает «каждый день в 03:00». `>>` дописывает вывод в лог, `2>&1` направляет туда же ошибки.

Через сутки проверьте, что отработало:

```bash
tail -5 /var/log/dogwalks-backup.log
ls -lh /var/backups/dog-walks/
```

## 8.4. Проверить восстановление

Бэкап, из которого ни разу не восстанавливались, — это не бэкап, а надежда. Проверяем на копии, не трогая рабочую базу:

```bash
cd /tmp
gunzip -c /var/backups/dog-walks/$(ls -t /var/backups/dog-walks/ | head -1) > /tmp/test-restore.db
sqlite3 /tmp/test-restore.db "SELECT COUNT(*) FROM walks;"
sqlite3 /tmp/test-restore.db "SELECT * FROM walks ORDER BY walk_date DESC LIMIT 3;"
rm /tmp/test-restore.db
```

Число записей должно совпадать с боевым, а последние строки — содержать свежие прогулки.

**Реальное восстановление**, если однажды понадобится:

```bash
pm2 stop dog-walks-backend
cp /var/lib/dog-walks/walks.db /var/lib/dog-walks/walks.db.broken   # на всякий случай
gunzip -c /var/backups/dog-walks/walks_ГГГГММДД_ЧЧММСС.db.gz > /var/lib/dog-walks/walks.db
sqlite3 /var/lib/dog-walks/walks.db "PRAGMA integrity_check;"
pm2 start dog-walks-backend
curl -s http://localhost:3000/api/health; echo
```

## 8.5. Копия к себе на машину

Третий уровень, если хочется совсем спокойно. На **своей** машине:

```bash
crontab -e
```

```
0 10 * * * /usr/bin/scp dogwalks:/var/backups/dog-walks/$(date +\%Y\%m\%d)*.gz ~/dog-walks-backups/ >/dev/null 2>&1
```

Знаки `%` в cron экранируются обратным слэшем — без этого строка обрежется. Скачивание сработает, только когда компьютер включён, поэтому это дополнение к первым двум уровням, а не замена.

---

# Шпаргалка на каждый день

```bash
# Начать работу
git checkout main && git pull
git checkout -b feature/название

# Запустить локально (два окна)
cd code/backend && npm run dev
cd code/frontend && npm run dev

# Посмотреть, что наменял
git status
git diff

# Прогнать тесты
cd code/backend && npm test

# Отправить
git add -A
git commit -m "feat: что сделал"
git push -u origin feature/название
# → открыть PR, дождаться зелёного CI, влить

# Прибраться
git checkout main && git pull
git branch -d feature/название
```

**Если сломался прод:**

```bash
# Посмотреть, что происходит
ssh dogwalks
pm2 logs dog-walks-backend --lines 100
pm2 status

# Откатиться на предыдущий коммит вручную
cd /opt/dog-walks-app
git log --oneline -5
git reset --hard <хеш нужного коммита>
cd code/backend && npm ci --omit=dev
cd ../frontend && npm ci && npm run build
cd /opt/dog-walks-app && pm2 reload ecosystem.config.cjs
```

**Восстановить базу из бэкапа:**

```bash
pm2 stop dog-walks-backend
gunzip -c /var/backups/dog-walks/walks_ГГГГММДД_ЧЧММСС.db.gz > /var/lib/dog-walks/walks.db
pm2 start dog-walks-backend
```

---

# Порядок выполнения

| # | Блок | Время | Готово |
|---|---|---|---|
| 1 | Порядок в репозитории: токен, `code/`, история | ~40 мин | ☐ |
| 2 | Локальное окружение и разбор бэкенда | ~1 час | ☐ |
| 3 | Ветки и защита main | ~20 мин | ☐ |
| 4 | Тесты | ~1 час | ☐ |
| 5 | CI | ~30 мин | ☐ |
| 6 | Подготовка сервера | ~40 мин | ☐ |
| 7 | Автодеплой | ~40 мин | ☐ |
| 8 | Бэкапы | ~30 мин | ☐ |

Блоки 1-3 логично сделать за один вечер, дальше по одному. После Блока 7 можно присылать список доработок — они уже поедут по новому процессу.
