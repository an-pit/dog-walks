Вот пошаговая инструкция по обновлению кода в GitHub и Yandex Cloud:

Шаг 1: Обновление кода в GitHub
Выполни эти команды в терминале на своём локальном компьютере (в папке dog-walks-app):

cd ~/Desktop/dog-walks-app

# Проверяем изменённые файлы
git status

# Добавляем все изменения
git add .

# Создаём коммит с описанием изменений
git commit -m "feat: add comments field, fix duration saving, default day view, mobile fixes"

# Отправляем в GitHub
git push origin main
Шаг 2: Обновление кода на Yandex Cloud VM
Подключись к серверу по SSH:

ssh username@103.76.53.197
Затем на сервере выполни:

# Переходим в папку проекта
cd ~/dog-walks-app

# Получаем последние изменения из GitHub
git pull origin main

# Обновляем базу данных (добавляем поле comments)
cd backend
npm run migrate

# Пересобираем frontend
cd ../frontend
npm run build

# Перезапускаем backend через PM2
cd ..
pm2 restart dog-walks-backend

# Проверяем статус
pm2 status
Важно: Миграция базы данных
Поскольку в базе данных уже есть данные, а мы добавили новое поле comments, нужно выполнить ALTER TABLE вместо пересоздания таблицы. Подключись к серверу и выполни:

# Открываем SQLite базу данных напрямую
sqlite3 ~/dog-walks-app/backend/database/walks.db

# Добавляем поле comments (если его ещё нет)
ALTER TABLE walks ADD COLUMN comments TEXT DEFAULT '';

# Выходим
.quit
Это безопасная операция — она добавит поле к существующим записям без потери данных.

Краткая схема процесса
graph LR
    A[Локальный компьютер] -->|git push| B[GitHub]
    B -->|git pull| C[Yandex Cloud VM]
    C -->|ALTER TABLE| D[SQLite DB]
    C -->|npm run build| E[Frontend Build]
    C -->|pm2 restart| F[Backend Server]
Проверка после деплоя
После перезапуска открой браузер и перейди на http://103.76.53.197 — приложение должно:

Открываться на вкладке «День» по умолчанию
Показывать поле для комментариев в модальном окне длительности
Корректно сохранять длительность прогулок
Нормально отображаться на мобильных устройствах в разделе «Неделя»
