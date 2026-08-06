# Шпаргалка

Все команды для повседневной работы. Путь к проекту:

```
/Users/pitushkin/Yandex.Disk.localized/Claude/projects/dog-walks-app
```

Дальше он обозначается как `<проект>`.

---

## 1. Правило номер один

**Новая ветка всегда начинается с обновления `main`.** Не с текущей ветки, а именно с `main`.

```bash
cd <проект>
git checkout main
git pull
git checkout -b тип/название
```

Если пропустить `git checkout main && git pull`, новая ветка вырастет из предыдущей и утащит в PR чужие изменения. Проверить, откуда растёт ветка, можно так:

```bash
git log --oneline main..HEAD
```

Должны быть **только ваши** коммиты по текущей задаче. Если видите чужие — ветка создана не от `main`.

Префиксы веток и коммитов:

| Префикс | Для чего |
|---|---|
| `feat/` | новая функциональность |
| `fix/` | исправление бага |
| `chore/` | инфраструктура, зависимости, конфиги |
| `docs/` | документация |
| `refactor/` | перестройка кода без смены поведения |

---

## 2. Запуск локально

Нужны **два терминала**, оба процесса работают одновременно и не возвращают приглашение — это нормально.

**Терминал 1 — бэкенд:**

```bash
cd <проект>/code/backend
npm run dev
```

Ожидаем `🚀 Сервер запущен на порту 3000`.

**Терминал 2 — фронтенд** (`Cmd+T` для новой вкладки):

```bash
cd <проект>/code/frontend
npm run dev
```

Открывать в браузере: **http://localhost:5173**

Бэкенд на 3000 отдаёт только API, интерфейса там нет — открывать его бесполезно.

Остановить любой процесс — `Ctrl+C` в его вкладке.

> Локальная база отдельная от прода и изначально пустая. Заполните пару слотов руками, чтобы было на чём проверять.

**После смены веток или обновления `main`:**

```bash
cd <проект>/code/backend && npm ci
cd ../frontend && npm ci
```

Нужно, если менялся `package.json` — иначе будете ловить странные ошибки про отсутствующие модули.

---

## 3. Тесты

```bash
cd <проект>/code/backend
npm test          # разовый прогон
npm run test:watch # перезапуск при изменении файлов
```

Тесты работают с базой в памяти, реальные данные не трогают. Гоняйте перед каждым коммитом.

---

## 4. Полный цикл правки

```bash
# 1. Свежая ветка от актуального main
cd <проект>
git checkout main
git pull
git checkout -b feat/название

# 2. Правки в коде...

# 3. Проверить, что наменяли
git status
git diff

# 4. Прогнать тесты
cd code/backend && npm test && cd ../..

# 5. Убедиться, что в ветке только ваши коммиты
git log --oneline main..HEAD

# 6. Закоммитить и отправить
git add -A
git commit -m "feat: что сделали"
git push -u origin feat/название
```

`-u` нужен только при первом пуше ветки, дальше хватает `git push`.

Дальше в терминале появится ссылка на создание PR. Открыть → **Create pull request** → дождаться зелёного `test` → **Merge pull request** → **Delete branch**.

**После вливания обязательно:**

```bash
git checkout main
git pull
git branch -d feat/название
```

Без `git pull` локальный `main` останется старым, и следующая ветка снова вырастет не оттуда.

---

## 5. Если что-то пошло не так

### PR не вливается: проверка `test` висит в ожидании

По порядку, от простого:

1. Посмотреть прогоны именно этой ветки:
   `https://github.com/an-pit/dog-walks/actions?query=branch%3Aимя-ветки`
2. Закрыть и сразу снова открыть PR — это заново шлёт событие `pull_request`
3. Пустой коммит — новый SHA, на который повесятся проверки заново:
   ```bash
   git commit --allow-empty -m "chore: перезапустить CI"
   git push
   ```
4. Крайний случай: Settings → Rules → Rulesets → `protect-main` → Edit → снять **Require status checks to pass**, влить, вернуть обратно

### В PR оказались чужие коммиты

Ветка создана не от `main`. Проще пересоздать:

```bash
git checkout main
git pull
git checkout -b feat/название-заново
# незакоммиченные правки перейдут вместе с вами
```

Если правки уже закоммичены в неправильную ветку, перенести нужный коммит:

```bash
git log --oneline          # найти хеш нужного коммита
git checkout main && git pull
git checkout -b feat/название-заново
git cherry-pick <хеш>
```

### Конфликт при merge

Разметка читается так: между `<<<<<<<` и `=======` — версия вашей ветки, между `=======` и `>>>>>>>` — версия той, с которой сливаете.

```bash
git checkout ваша-ветка
git fetch origin
git merge origin/main
# ...разрешить конфликты в файлах...
git add .
git commit
git push
```

### Локально всё сломалось, хочу как в main

```bash
git checkout main
git fetch origin
git reset --hard origin/main
```

⚠️ Стирает все незакоммиченные изменения. Сначала убедитесь, что нужное закоммичено или скопировано.

### Забыл, что вообще происходит

```bash
git status                    # что изменено сейчас
git branch --show-current     # где я
git log --oneline -5          # последние коммиты
git log --oneline main..HEAD  # что в ветке сверх main
git remote -v                 # куда пушим
```

---

## 6. Сервер

Подключение:

```bash
ssh dogwalks
```

### Что происходит с приложением

```bash
pm2 status
pm2 logs dog-walks-backend --lines 50 --nostream
systemctl status nginx --no-pager
```

### Приложение отдаёт 502

502 означает, что nginx жив, а бэкенд на порту 3000 не отвечает.

```bash
pm2 logs dog-walks-backend --lines 50 --nostream   # причина будет здесь
cd /opt/dog-walks-app
pm2 delete dog-walks-backend
pm2 start ecosystem.config.cjs
pm2 save
```

### Проверить, что всё работает

```bash
curl -s http://localhost:3000/api/health; echo
curl -s "http://localhost:3000/api/walks?from=2026-08-01&to=2026-08-05"; echo
curl -s http://103.76.53.197/api/health; echo
curl -I "http://103.76.53.197/api/walks?from=2026-08-01&to=2026-08-05"
```

Ожидаем: `ok`, JSON с прогулками, снова `ok`, и `401 Unauthorized` на последнюю — она проверяет, что защита паролем работает.

### Откатить прод на предыдущую версию

```bash
cd /opt/dog-walks-app
git log --oneline -5
git reset --hard <хеш нужного коммита>
cd code/backend && npm ci --omit=dev
cd ../frontend && npm ci && npm run build
cd /opt/dog-walks-app && pm2 reload ecosystem.config.cjs --update-env
curl -s http://localhost:3000/api/health; echo
```

### Ручной деплой, если автоматика не сработала

Через интерфейс GitHub: **Actions** → слева **Deploy** → кнопка **Run workflow** → ветка `main` → **Run workflow**.

По SSH, если и это недоступно:

```bash
ssh dogwalks
bash /opt/dog-walks-app/scripts/deploy.sh
```

Скрипт сам откатится, если health-check не пройдёт.

### Прод не обновился после вливания PR

Сначала проверьте, был ли прогон вообще: **Actions** → слева **Deploy**. Если для вашего merge-коммита прогона нет:

1. **Settings → Actions → General** — вверху должно стоять «Allow all actions and reusable workflows», а не «Disable actions»
2. **Actions → Deploy → меню `⋯`** — если там пункт **Enable workflow**, workflow отключён, включите
3. Пока разбираетесь, выкатите вручную (см. выше) — прод не должен ждать

Проверить, какая версия сейчас на сервере:

```bash
ssh dogwalks
cd /opt/dog-walks-app && git log --oneline -1
```

Сравнить с последним коммитом в `main` на GitHub.

---

## 7. Бэкапы

### Снять прямо сейчас

```bash
ssh dogwalks
sudo /opt/backup-dogwalks.sh
```

Ожидаем две строки: `✅` про локальный файл и `☁️` про загрузку в Object Storage.

### Посмотреть, что есть

```bash
ls -lh /var/backups/dog-walks/
tail -10 /var/log/dogwalks-backup.log
```

### Скачать копию к себе

```bash
scp dogwalks:/var/backups/dog-walks/walks_ГГГГММДД_ЧЧММСС.db.gz ~/dog-walks-backups/
```

### Проверить бэкап, не трогая рабочую базу

```bash
cd /tmp
gunzip -c /var/backups/dog-walks/$(ls -t /var/backups/dog-walks/ | head -1) > /tmp/test.db
sqlite3 /tmp/test.db "SELECT COUNT(*) FROM walks;"
rm /tmp/test.db
```

### Восстановить базу из бэкапа

```bash
pm2 stop dog-walks-backend
cp /var/lib/dog-walks/walks.db /var/lib/dog-walks/walks.db.broken
gunzip -c /var/backups/dog-walks/walks_ГГГГММДД_ЧЧММСС.db.gz > /var/lib/dog-walks/walks.db
sqlite3 /var/lib/dog-walks/walks.db "PRAGMA integrity_check;"
pm2 start dog-walks-backend
```

---

## 8. База данных

### Посмотреть содержимое

```bash
ssh dogwalks
sqlite3 /var/lib/dog-walks/walks.db

# внутри sqlite3:
.tables
.schema walks
SELECT COUNT(*) FROM walks;
SELECT * FROM walks ORDER BY walk_date DESC LIMIT 5;
PRAGMA user_version;      # версия схемы = число применённых миграций
.quit
```

### Добавить новую миграцию

Только **в конец** массива в `code/backend/src/migrations.js`. Существующие менять нельзя — они уже применены на проде, и правка задним числом разведёт схемы.

Применяется автоматически при старте сервера, отдельной команды не нужно.

---

## 9. Где что лежит

### Локально

| Что | Путь |
|---|---|
| Бэкенд | `<проект>/code/backend/src/` |
| Тесты | `<проект>/code/backend/tests/` |
| Фронтенд | `<проект>/code/frontend/src/` |
| Настройки локальные | `<проект>/code/backend/.env` |
| Документация | `<проект>/docs/` |

### На сервере

| Что | Путь |
|---|---|
| Код | `/opt/dog-walks-app/` |
| База | `/var/lib/dog-walks/walks.db` |
| Бэкапы | `/var/backups/dog-walks/` |
| Скрипт бэкапа | `/opt/backup-dogwalks.sh` |
| Конфиг nginx | `/etc/nginx/sites-available/dog-walks` |
| Пароли Basic Auth | `/etc/nginx/.htpasswd` |
| Конфиг s3cmd | `/home/ubuntu/.s3cfg` |

### Ссылки

| Куда | Адрес |
|---|---|
| Прод | http://103.76.53.197/ |
| Репозиторий | https://github.com/an-pit/dog-walks |
| Прогоны CI | https://github.com/an-pit/dog-walks/actions |
| Настройки защиты `main` | Settings → Rules → Rulesets |
| Секреты для деплоя | Settings → Secrets and variables → Actions |
| Консоль облака | https://console.yandex.cloud/folders/b1gbthcnlnff5leli313 |

---

## 10. Правила, за которые уже платили временем

**Интерактивные команды запускаются по одной.** `htpasswd`, `ssh-keygen`, `passwd`, `crontab -e`, `s3cmd --configure`, `apt` без `-y` — все задают вопросы. Если вставить блок целиком, следующая строка станет ответом на приглашение.

**`>>` дописывает, `>` перезаписывает.** Одна лишняя `>` в команде с `authorized_keys` сотрёт все ключи и запрёт вас снаружи.

**Проверять новый SSH-ключ надо из второго окна,** не закрывая рабочую сессию.

**`git check-ignore -v` печатает и отрицающие правила.** Строка вида `.gitignore:147:!.env.example` означает «файл НЕ игнорируется», то есть всё настроено верно. Окончательная проверка — `git add -A && git status --short`.

**Один новый файл — одна ветка.** Если положить его в две параллельные ветки, он приедет в `main` двумя путями, и второй PR встретит конфликт на ровном месте.

**`git reset --hard` смотрит на локальную ссылку `origin/main`.** Если давно не делали `git fetch`, она устарела, и сброс откатит вас назад. Сначала `git fetch`, потом `reset`.

**Нативные модули привязаны к версии Node.** После смены версии `node_modules` надо сносить целиком: `rm -rf node_modules && npm ci`. Досоздание не поможет.
