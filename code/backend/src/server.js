import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb } from './db.js';
import { migrate } from './migrations.js';
import { createApp } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Читает .env рядом с бэкендом.
 *
 * Почему изнутри приложения, а не флагом `node --env-file`: PM2 в режиме
 * cluster не передаёт node_args воркеру, и флаг молча не срабатывал.
 * Здесь способ запуска не важен.
 *
 * Уже заданные переменные не перезаписываются: окружение процесса важнее
 * файла. Иначе строка DB_PATH из .env перебила бы путь к боевой базе,
 * который PM2 передаёт через ecosystem.config.cjs.
 */
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;

      const separator = trimmed.indexOf('=');
      if (separator === -1) return;

      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    });
}

loadEnvFile(path.join(__dirname, '..', '.env'));

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
