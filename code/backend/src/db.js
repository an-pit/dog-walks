import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

/**
 * Открывает подключение к SQLite.
 * dbPath может быть путём к файлу либо ':memory:' — база в оперативной
 * памяти, которая живёт только пока работает процесс. Второе используется
 * в тестах: каждый тест получает чистую базу и не трогает реальные данные.
 */
export function openDb(dbPath) {
  if (dbPath !== ':memory:') {
    // better-sqlite3 создаёт файл базы, но не создаёт папку под него.
    // Git не хранит пустые директории, поэтому после свежего клона
    // ./database/ отсутствует и приложение падало бы при старте.
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);

  // WAL (write-ahead logging) позволяет читать из базы одновременно с записью,
  // вместо того чтобы блокировать читателей на время записи.
  // Для базы в памяти режим не применяется, поэтому пропускаем.
  if (dbPath !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }

  // Включаем проверку внешних ключей — понадобится, когда появятся
  // отдельные таблицы пользователей и питомцев.
  db.pragma('foreign_keys = ON');

  return db;
}
