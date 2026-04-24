import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Создаём базу данных в папке database
const dbPath = path.join(__dirname, '..', 'database', 'walks.db');
const db = new Database(dbPath);

// Создаём таблицу walks
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

// Создаём индекс для быстрого поиска по дате
db.exec('CREATE INDEX IF NOT EXISTS idx_walks_date ON walks(walk_date)');

console.log('✅ База данных инициализирована:', dbPath);
console.log('✅ Таблица walks создана');

db.close();