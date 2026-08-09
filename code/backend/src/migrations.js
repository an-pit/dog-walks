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

  // v3 — отметка о туалете.
  // Три состояния: NULL (не отмечено), 'yes', 'no'.
  // Значение по умолчанию именно NULL, а не 'no': все записи, сделанные
  // до этой миграции, честно остаются «неизвестно» вместо того,
  // чтобы утверждать, будто собака ни разу не покакала.
  (db) => {
    const columns = db.pragma('table_info(walks)');
    const hasPoop = columns.some((c) => c.name === 'poop');

    if (!hasPoop) {
      db.exec('ALTER TABLE walks ADD COLUMN poop TEXT DEFAULT NULL');
    }
  },

  // v4 — ноль в duration никогда не означал «прогулка на ноль минут»,
  // только «не засекали». Разводим эти смыслы: теперь нет данных — это NULL.
  // Без этого средняя длительность систематически занижалась.
  (db) => {
    db.exec('UPDATE walks SET duration = NULL WHERE duration = 0');
  },

  // v5 — время возвращения с прогулки.
  // Нужно для расчёта разрыва между выходами: updated_at для этого не годится,
  // он показывает момент редактирования записи, а не саму прогулку.
  // Формат ISO без зоны: '2026-08-07T21:35'.
  (db) => {
    const columns = db.pragma('table_info(walks)');
    if (!columns.some((c) => c.name === 'ended_at')) {
      db.exec('ALTER TABLE walks ADD COLUMN ended_at TEXT DEFAULT NULL');
    }
  },

  // v6 — журнал изменений.
  // changed_by пока пустой: пользователей в приложении ещё нет.
  // Появятся — начнёт заполняться, старые записи останутся без автора.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS walk_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        walk_date TEXT NOT NULL,
        slot TEXT NOT NULL,
        field TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        changed_by TEXT,
        changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_changes_walk ON walk_changes(walk_date, slot)'
    );
  },

  // v7 — сохранённые разборы от языковой модели.
  // Храним период, текст и версию промпта: со сменой промпта старые
  // разборы остаются, и видно, чем именно каждый получен.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ai_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period_from TEXT NOT NULL,
        period_to TEXT NOT NULL,
        content TEXT NOT NULL,
        model TEXT,
        prompt_version INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_reports_period ON ai_reports(period_from, period_to)'
    );
  },
];

// В тестах миграции прогоняются на каждый случай, и логи забивают вывод
const quiet = process.env.NODE_ENV === 'test';
const log = (message) => {
  if (!quiet) console.log(message);
};

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

    log(`✅ Применена миграция v${i + 1}`);
  }

  if (currentVersion === migrations.length) {
    log(`✅ База актуальна (версия ${currentVersion})`);
  }
}
