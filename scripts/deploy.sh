#!/usr/bin/env bash
#
# Скрипт выкатки. Запускается НА СЕРВЕРЕ, но лежит в репозитории —
# GitHub Actions передаёт его по SSH и выполняет там.
#
# Ручной запуск на сервере, если нужно:
#   bash /opt/dog-walks-app/scripts/deploy.sh

# -e  — остановиться на первой же ошибке
# -u  — ругаться на необъявленные переменные
# -o pipefail — ловить ошибки внутри конвейеров
# Без этого скрипт бодро продолжит работу после падения npm ci
# и «задеплоит» сломанное.
set -euo pipefail

APP_DIR=/opt/dog-walks-app
HEALTH_URL=http://localhost:3000/api/health

cd "$APP_DIR"

# Запоминаем текущую версию, чтобы было куда откатиться
PREV=$(git rev-parse HEAD)
echo "▶ Текущая версия: ${PREV:0:8}"

echo "▶ Забираем свежий код"
git fetch origin
git reset --hard origin/main
NEXT=$(git rev-parse HEAD)
echo "▶ Обновлено до: ${NEXT:0:8}"

if [ "$PREV" = "$NEXT" ]; then
  echo "▶ Версия не изменилась, но пересоберём на всякий случай"
fi

echo "▶ Зависимости бэкенда"
cd "$APP_DIR/code/backend"
npm ci --omit=dev

echo "▶ Сборка фронтенда"
cd "$APP_DIR/code/frontend"
npm ci
npm run build

echo "▶ Перезапуск"
cd "$APP_DIR"
# reload вместо restart: PM2 поднимает новый процесс до того,
# как погасить старый, поэтому простоя почти нет.
# Миграции применятся сами при старте server.js.
pm2 reload ecosystem.config.cjs --update-env

echo "▶ Ждём health-check"
for i in {1..10}; do
  if curl -fsS --max-time 3 "$HEALTH_URL" > /dev/null 2>&1; then
    echo "✅ Деплой прошёл: ${NEXT:0:8}"
    exit 0
  fi
  sleep 2
done

# ───────── сюда попадаем, только если сервис не поднялся ─────────

echo "❌ Health-check не прошёл за 20 секунд. Откатываемся на ${PREV:0:8}" >&2

cd "$APP_DIR"
git reset --hard "$PREV"

cd "$APP_DIR/code/backend" && npm ci --omit=dev
cd "$APP_DIR/code/frontend" && npm ci && npm run build
cd "$APP_DIR" && pm2 reload ecosystem.config.cjs --update-env

sleep 3
if curl -fsS --max-time 3 "$HEALTH_URL" > /dev/null 2>&1; then
  echo "↩️  Откат выполнен, работает предыдущая версия" >&2
else
  echo "🔥 Откат не помог — нужен ручной разбор: pm2 logs dog-walks-backend" >&2
fi

exit 1
