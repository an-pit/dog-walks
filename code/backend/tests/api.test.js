import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { openDb } from '../src/db.js';
import { migrate } from '../src/migrations.js';
import { createApp } from '../src/app.js';

let app;

beforeEach(() => {
  // ':memory:' — база в оперативной памяти. Живёт только внутри одного теста,
  // реальные данные не трогаются, каждый тест стартует с чистого листа.
  const db = openDb(':memory:');
  migrate(db);
  app = createApp(db);
});

describe('GET /api/health', () => {
  it('отвечает ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('GET /api/walks', () => {
  it('требует параметры from и to', async () => {
    const res = await request(app).get('/api/walks');
    expect(res.status).toBe(400);
  });

  it('отклоняет некорректную дату', async () => {
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

  it('сохраняет комментарий — та самая колонка, которой нет на проде', async () => {
    await request(app)
      .put('/api/walks/2026-08-01/morning')
      .send({ person: 'andrey', duration: 45, comments: 'встретили соседского пса' });

    const res = await request(app).get('/api/walks?from=2026-08-01&to=2026-08-01');
    expect(res.body[0].comments).toBe('встретили соседского пса');
  });

  it('перезаписывает существующую запись, а не плодит дубли', async () => {
    await request(app)
      .put('/api/walks/2026-08-01/morning')
      .send({ person: 'andrey', duration: 30 });
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

  it('отклоняет неизвестного человека', async () => {
    const res = await request(app).put('/api/walks/2026-08-01/morning').send({ person: 'кто-то' });
    expect(res.status).toBe(400);
  });

  it('отклоняет отрицательную длительность', async () => {
    const res = await request(app)
      .put('/api/walks/2026-08-01/morning')
      .send({ person: 'andrey', duration: -10 });
    expect(res.status).toBe(400);
  });

  it('отклоняет длительность больше 480 минут', async () => {
    const res = await request(app)
      .put('/api/walks/2026-08-01/morning')
      .send({ person: 'andrey', duration: 9999 });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/stats', () => {
  it('засчитывает прогулку both обоим участникам', async () => {
    await request(app).put('/api/walks/2026-08-01/morning').send({ person: 'both', duration: 60 });

    const res = await request(app).get('/api/stats?from=2026-08-01&to=2026-08-01');
    expect(res.body.statistics.andrey).toBe(1);
    expect(res.body.statistics.ira).toBe(1);
    expect(res.body.statistics.andreyDuration).toBe(60);
    expect(res.body.statistics.iraDuration).toBe(60);
  });

  it('не засчитывает прогулку none никому', async () => {
    await request(app).put('/api/walks/2026-08-01/morning').send({ person: 'none', duration: 0 });

    const res = await request(app).get('/api/stats?from=2026-08-01&to=2026-08-01');
    expect(res.body.statistics.andrey).toBe(0);
    expect(res.body.statistics.ira).toBe(0);
    expect(res.body.statistics.total).toBe(1);
  });
});

describe('GET /api/export', () => {
  it('отдаёт CSV с заголовком', async () => {
    await request(app)
      .put('/api/walks/2026-08-01/morning')
      .send({ person: 'andrey', duration: 45, comments: 'обычная прогулка' });

    const res = await request(app).get('/api/export?from=2026-08-01&to=2026-08-01');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Дата,Слот,Кто гулял');
    expect(res.text).toContain('Андрей');
  });
});

describe('миграции', () => {
  it('повторный запуск ничего не ломает', () => {
    const db = openDb(':memory:');
    migrate(db);
    migrate(db);
    const version = db.pragma('user_version', { simple: true });
    expect(version).toBe(2);
  });

  it('докатывает схему со старой версии', () => {
    const db = openDb(':memory:');
    // Имитируем прод: таблица есть, колонки comments нет, версия не выставлена
    db.exec(`
      CREATE TABLE walks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        walk_date TEXT NOT NULL,
        slot TEXT NOT NULL CHECK (slot IN ('morning', 'afternoon', 'evening')),
        person TEXT NOT NULL CHECK (person IN ('andrey', 'ira', 'both', 'none')),
        duration INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(walk_date, slot)
      )
    `);

    migrate(db);

    const columns = db.pragma('table_info(walks)');
    expect(columns.some((c) => c.name === 'comments')).toBe(true);
  });
});

describe('openDb', () => {
  it('создаёт папку под файл базы, если её нет', () => {
    // Git не хранит пустые директории, поэтому после клонирования
    // ./database/ отсутствует — приложение должно создать её само
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dogwalks-'));
    const nested = path.join(dir, 'database', 'walks.db');

    expect(fs.existsSync(path.dirname(nested))).toBe(false);

    const db = openDb(nested);
    migrate(db);
    db.close();

    expect(fs.existsSync(nested)).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
