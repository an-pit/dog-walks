/**
 * Версионированные миграции.
 *
 * SQLite хранит внутри себя число user_version. Мы используем его как счётчик
 * применённых шагов: база сама знает, на каком она месте, а migrate() докатывает
 * недостающее. Благодаря этому прод, локальная машина и тестовая база в памяти
 * всегда приходят к одинаковой схеме.
 *
 * ПРАВИЛО: новые миграции добавляются ТОЛЬКО в конец массива.
 * Уже существующие менять нельзя — они давно применены на проде,
 * и правка задним числом создаст расхождение схем.
 */

const migrations = [
  // v1 — исходная таблица прогулок
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

  // v2 — комментарии к прогулке.
  // Именно этой колонки не хватает на проде: код её ждёт, а база не отдаёт.
  (db) => {
    const columns = db.pragma('table_info(walks)');
    const hasComments = columns.some((c) => c.name === 'comments');

    if (!hasComments) {
      db.exec("ALTER TABLE walks ADD COLUMN comments TEXT DEFAULT ''");
    }
  },
];

export function migrate(db) {
  const currentVersion = db.pragma('user_version', { simple: true });

  if (currentVersion > migrations.length) {
    throw new Error(
      `База на версии ${currentVersion}, а код знает только ${migrations.length}. ` +
        'Похоже, откатили код без отката базы.'
    );
  }

  for (let i = currentVersion; i < migrations.length; i++) {
    // Транзакция: миграция применяется целиком либо не применяется вовсе.
    db.transaction(() => {
      migrations[i](db);
      db.pragma(`user_version = ${i + 1}`);
    })();

    console.log(`✅ Применена миграция v${i + 1}`);
  }

  if (currentVersion === migrations.length) {
    console.log(`✅ База актуальна (версия ${currentVersion})`);
  }
}
