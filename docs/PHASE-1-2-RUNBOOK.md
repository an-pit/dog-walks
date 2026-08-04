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

## 6.0. Обновить Node на сервере до 24

Сейчас на VM стоит Node 18 — он снят с поддержки и не получает обновлений безопасности. Плюс на нём не соберётся `better-sqlite3` в новой версии. Обновляем до той же версии, что и локально.

```bash
ssh dogwalks
node --version        # покажет v18.x
```

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version        # должно стать v24.x
```

После обновления Node нативные модули надо пересобрать — бинарник `better-sqlite3` скомпилирован под старую версию и просто не загрузится:

```bash
cd /opt/dog-walks-app/code/backend 2>/dev/null || cd /opt/dog-walks-app/backend
rm -rf node_modules
npm ci --omit=dev
pm2 restart dog-walks-backend
pm2 logs dog-walks-backend --lines 20 --nostream
```

В логах не должно быть `NODE_MODULE_VERSION` или `invalid ELF header`. Проверьте, что приложение отвечает:

```bash
curl -s http://localhost:3000/api/walks?from=2026-08-01\&to=2026-08-02
```

> Если что-то пойдёт не так — база лежит отдельно и не пострадает, а откатиться можно, поставив обратно `setup_18.x`. Но сначала убедитесь, что свежий бэкап базы у вас на руках.

## 6.1. Вынести базу из папки проекта

Сейчас база лежит внутри `/opt/dog-walks-app/backend/database/`. Автодеплой делает `git reset --hard`, и однажды это её снесёт. Переносим.

**Сначала бэкап** (если ещё не делали свежий):

```bash
scp dogwalks:/opt/dog-walks-app/backend/database/walks.db ~/dog-walks-backups/walks-before-move.db
```

Теперь на сервере:

```bash
pm2 stop dog-walks-backend

sudo mkdir -p /var/lib/dog-walks
sudo mv /opt/dog-walks-app/backend/database/walks.db /var/lib/dog-walks/
sudo chown -R ubuntu:ubuntu /var/lib/dog-walks
ls -lh /var/lib/dog-walks/
```

## 6.2. Обновить структуру и пути под `code/`

На сервере лежит старая раскладка, без `code/`. После первого автодеплоя она подтянется из git сама, но nginx и PM2 надо переучить заранее.

**PM2** — создайте в корне репозитория `ecosystem.config.cjs` (расширение `.cjs`, потому что в проекте включены ES-модули):

```js
module.exports = {
  apps: [{
    name: 'dog-walks-backend',
    script: './code/backend/src/server.js',
    cwd: '/opt/dog-walks-app',
    instances: 1,
    autorestart: true,
    max_memory_restart: '300M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      DB_PATH: '/var/lib/dog-walks/walks.db',
    },
  }],
};
```

Теперь конфигурация PM2 живёт в git, а не только на сервере.

**nginx** — `sudo nano /etc/nginx/sites-available/dog-walks`. Поправьте `root` на новый путь и добавьте исключение для health-check:

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

## 6.3. Ключ для автодеплоя

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

## 6.4. Разово привести сервер к новой структуре

```bash
cd /opt/dog-walks-app
git remote set-url origin https://github.com/an-pit/dog-walks.git
git fetch origin
git reset --hard origin/main

cd code/backend && npm ci --omit=dev
cd ../frontend && npm ci && npm run build

cd /opt/dog-walks-app
pm2 delete dog-walks-backend
pm2 start ecosystem.config.cjs
pm2 save
```

Проверка:

```bash
curl -s http://localhost:3000/api/health
```

Ожидаем `{"status":"ok","version":"dev"}`.

---

# Блок 7. Автодеплой

## 7.1. Скрипт деплоя

Создайте `scripts/deploy.sh` в корне репозитория:

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/dog-walks-app
cd "$APP_DIR"

PREV=$(git rev-parse HEAD)
echo "▶ Текущая версия: $PREV"

git fetch origin
git reset --hard origin/main
echo "▶ Обновлено до: $(git rev-parse HEAD)"

cd "$APP_DIR/code/backend" && npm ci --omit=dev
cd "$APP_DIR/code/frontend" && npm ci && npm run build

cd "$APP_DIR"
pm2 reload ecosystem.config.cjs --update-env

echo "▶ Ждём подъёма сервиса..."
sleep 3

if curl -fsS --max-time 5 http://localhost:3000/api/health > /dev/null; then
  echo "✅ Деплой прошёл"
else
  echo "❌ Health-check не прошёл, откатываемся на $PREV"
  git reset --hard "$PREV"
  cd "$APP_DIR/code/backend" && npm ci --omit=dev
  cd "$APP_DIR/code/frontend" && npm ci && npm run build
  cd "$APP_DIR" && pm2 reload ecosystem.config.cjs --update-env
  echo "↩️  Откат выполнен"
  exit 1
fi
```

`set -euo pipefail` в первой строке — важная деталь: `-e` останавливает скрипт на первой же ошибке, `-u` ругается на необъявленные переменные, `-o pipefail` ловит ошибки внутри пайпов. Без этого скрипт бодро продолжит работу после падения `npm ci` и «задеплоит» сломанное.

```bash
chmod +x scripts/deploy.sh
```

## 7.2. Workflow

Создайте `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
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
      - working-directory: code/backend
        run: npm ci && npm test

  deploy:
    needs: test          # не запустится, пока тесты не прошли
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Настроить SSH
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.DEPLOY_SSH_KEY }}" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          ssh-keyscan -H ${{ secrets.DEPLOY_HOST }} >> ~/.ssh/known_hosts

      - name: Выкатить
        run: |
          ssh -i ~/.ssh/id_ed25519 \
              ${{ secrets.DEPLOY_USER }}@${{ secrets.DEPLOY_HOST }} \
              'bash -s' < scripts/deploy.sh

      - name: Проверить снаружи
        run: |
          curl -fsS --max-time 10 \
            http://${{ secrets.DEPLOY_HOST }}/api/health | tee /dev/stderr | grep -q '"status":"ok"'
```

`needs: test` — ключевая строка. Она делает так, что деплой физически не начнётся, пока тесты не зелёные.

Последний шаг проверяет сервис снаружи, через nginx — это ловит случаи, когда бэкенд жив, а nginx настроен криво.

## 7.3. Первый запуск

```bash
git checkout -b chore/add-deploy
git add .github/workflows/deploy.yml scripts/deploy.sh ecosystem.config.cjs
git commit -m "chore: автодеплой на push в main"
git push -u origin chore/add-deploy
```

PR → merge → откройте вкладку **Actions** и смотрите, как всё едет. Первый раз почти наверняка что-нибудь упадёт — это нормально, логи в Actions подробные, покажете мне вывод, разберём.

---

# Блок 8. Бэкапы

Сейчас бэкапов нет вообще. Даже простой вариант радикально лучше, чем ничего.

## 8.1. Локальные, на сервере

```bash
sudo nano /opt/backup-dogwalks.sh
```

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=/var/backups/dog-walks
DB=/var/lib/dog-walks/walks.db
STAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# .backup — правильный способ копировать SQLite: он делает
# согласованный снимок даже во время записи, в отличие от cp
sqlite3 "$DB" ".backup '$BACKUP_DIR/walks_$STAMP.db'"
gzip "$BACKUP_DIR/walks_$STAMP.db"

find "$BACKUP_DIR" -name "walks_*.db.gz" -mtime +30 -delete
echo "Бэкап готов: walks_$STAMP.db.gz"
```

```bash
sudo chmod +x /opt/backup-dogwalks.sh
sudo /opt/backup-dogwalks.sh     # проверить, что работает
sudo crontab -e
```

Добавьте строку — каждый день в 03:00:

```
0 3 * * * /opt/backup-dogwalks.sh >> /var/log/dogwalks-backup.log 2>&1
```

## 8.2. Копия за пределы сервера

Бэкап на том же диске не спасает от гибели диска. Минимально рабочий вариант — тянуть копию к себе. На своей машине:

```bash
crontab -e
```

```
0 10 * * * scp dogwalks:/var/backups/dog-walks/$(date +\%Y\%m\%d)*.gz ~/dog-walks-backups/ 2>/dev/null
```

Правильнее — заливать в Yandex Object Storage через сервисный аккаунт. Настроим отдельно, когда автодеплой заработает; сейчас важнее, чтобы бэкапы просто появились.

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
