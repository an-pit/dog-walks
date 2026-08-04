import path from 'path';
import { fileURLToPath } from 'url';
import { openDb } from './db.js';
import { migrate } from './migrations.js';
import { createApp } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Путь к базе берём из переменной окружения:
// локально — из .env, на сервере — из ecosystem.config.cjs (PM2).
// Запасной вариант нужен, чтобы проект запускался сразу после клонирования.
const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'database', 'walks.db');
const PORT = process.env.PORT || 3000;

const db = openDb(dbPath);

// Миграции прогоняются при каждом старте. Уже применённые пропускаются,
// поэтому операция дешёвая и безопасная — и схема на проде не может отстать.
migrate(db);

const app = createApp(db);

const server = app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📁 База данных: ${dbPath}`);
  console.log(`📊 API: http://localhost:${PORT}/api`);
});

// Корректное завершение: PM2 при reload шлёт SIGINT, systemd — SIGTERM.
// Без этого соединение с базой закрывается резко, что в WAL-режиме
// иногда оставляет за собой лишние файлы.
function shutdown(signal) {
  console.log(`\n${signal}: останавливаемся...`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
