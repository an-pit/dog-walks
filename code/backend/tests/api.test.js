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
    // Отметка «никто не гулял» — не прогулка, в «Всего» ей не место
    expect(res.body.statistics.total).toBe(0);
    // Но запись за день есть, и это отличается от полного отсутствия данных
    expect(res.body.statistics.daysWithRecords).toBe(1);
    expect(res.body.statistics.daysWithWalks).toBe(0);
  });

  it('отличает дни с записями от дней без данных', async () => {
    await request(app).put('/api/walks/2026-08-01/morning').send({ person: 'andrey', duration: 30 });
    await request(app).put('/api/walks/2026-08-03/evening').send({ person: 'ira', duration: 20 });

    const res = await request(app).get('/api/stats?from=2026-08-01&to=2026-08-05');
    expect(res.body.statistics.total).toBe(2);
    expect(res.body.statistics.daysWithRecords).toBe(2);
    expect(res.body.statistics.daysWithWalks).toBe(2);
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

  it('выгружает комментарий в отдельной колонке', async () => {
    await request(app)
      .put('/api/walks/2026-08-01/evening')
      .send({ person: 'ira', duration: 30, comments: 'гуляли у реки' });

    const res = await request(app).get('/api/export?from=2026-08-01&to=2026-08-01');
    expect(res.text).toContain('Комментарий');
    expect(res.text).toContain('гуляли у реки');
  });

  it('экранирует запятые и кавычки в комментарии, не ломая колонки', async () => {
    await request(app)
      .put('/api/walks/2026-08-01/morning')
      .send({ person: 'andrey', duration: 20, comments: 'дождь, ветер и "лужи"' });

    const res = await request(app).get('/api/export?from=2026-08-01&to=2026-08-01');
    const row = res.text.split('\n').find((line) => line.startsWith('2026-08-01,Утро'));

    // Запятая внутри комментария заменяется на «;», иначе она разорвала бы строку
    expect(row).toContain('дождь; ветер');
    // Кавычки удваиваются по правилам CSV
    expect(row).toContain('""лужи""');
  });
});

describe('отметка о туалете', () => {
  it('по умолчанию не отмечена', async () => {
    await request(app).put('/api/walks/2026-08-01/morning').send({ person: 'andrey', duration: 30 });

    const res = await request(app).get('/api/walks?from=2026-08-01&to=2026-08-01');
    expect(res.body[0].poop).toBeNull();
  });

  it('сохраняет yes и no', async () => {
    await request(app)
      .put('/api/walks/2026-08-01/morning')
      .send({ person: 'andrey', duration: 30, poop: 'yes' });
    await request(app)
      .put('/api/walks/2026-08-01/evening')
      .send({ person: 'ira', duration: 40, poop: 'no' });

    const res = await request(app).get('/api/walks?from=2026-08-01&to=2026-08-01');
    const bySlot = Object.fromEntries(res.body.map((w) => [w.slot, w.poop]));

    expect(bySlot.morning).toBe('yes');
    expect(bySlot.evening).toBe('no');
  });

  it('позволяет вернуться в состояние «не отмечено»', async () => {
    await request(app)
      .put('/api/walks/2026-08-01/morning')
      .send({ person: 'andrey', duration: 30, poop: 'yes' });
    await request(app)
      .put('/api/walks/2026-08-01/morning')
      .send({ person: 'andrey', duration: 30, poop: null });

    const res = await request(app).get('/api/walks?from=2026-08-01&to=2026-08-01');
    expect(res.body[0].poop).toBeNull();
  });

  it('отклоняет посторонние значения', async () => {
    const res = await request(app)
      .put('/api/walks/2026-08-01/morning')
      .send({ person: 'andrey', poop: 'может быть' });
    expect(res.status).toBe(400);
  });

  it('считает отмеченные отдельно от неотмеченных', async () => {
    await request(app)
      .put('/api/walks/2026-08-01/morning')
      .send({ person: 'andrey', duration: 30, poop: 'yes' });
    await request(app)
      .put('/api/walks/2026-08-01/afternoon')
      .send({ person: 'ira', duration: 20, poop: 'no' });
    // Третья прогулка без отметки — не должна попасть ни в yes, ни в no
    await request(app)
      .put('/api/walks/2026-08-01/evening')
      .send({ person: 'andrey', duration: 40 });

    const res = await request(app).get('/api/stats?from=2026-08-01&to=2026-08-01');
    expect(res.body.statistics.poopYes).toBe(1);
    expect(res.body.statistics.poopNo).toBe(1);
    expect(res.body.statistics.poopMarked).toBe(2);
    expect(res.body.statistics.total).toBe(3);
    expect(res.body.statistics.daysWithWalks).toBe(1);
  });

  it('выгружается в CSV, неотмеченные — пустой ячейкой', async () => {
    await request(app)
      .put('/api/walks/2026-08-01/morning')
      .send({ person: 'andrey', duration: 30, poop: 'yes' });
    await request(app)
      .put('/api/walks/2026-08-01/evening')
      .send({ person: 'ira', duration: 40 });

    const res = await request(app).get('/api/export?from=2026-08-01&to=2026-08-01');
    const lines = res.text.split('\n');

    expect(lines[0]).toContain('Туалет');
    expect(lines.find((l) => l.startsWith('2026-08-01,Утро'))).toContain(',Да,');
    expect(lines.find((l) => l.startsWith('2026-08-01,Вечер'))).toContain(',,');
  });
});

describe('миграции', () => {
  it('повторный запуск ничего не ломает', () => {
    const db = openDb(':memory:');

    migrate(db);
    const afterFirst = db.pragma('user_version', { simple: true });

    migrate(db);
    const afterSecond = db.pragma('user_version', { simple: true });

    // Проверяем идемпотентность, а не конкретный номер: иначе тест
    // придётся править при каждой новой миграции
    expect(afterSecond).toBe(afterFirst);
    expect(afterFirst).toBeGreaterThan(0);
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
    expect(columns.some((c) => c.name === 'poop')).toBe(true);
  });

  it('не подменяет NULL на «no» у записей, сделанных до v3', () => {
    const db = openDb(':memory:');
    // База на v2: есть comments, но нет poop
    migrate(db);
    db.exec("UPDATE walks SET poop = NULL");
    db.prepare(
      `INSERT INTO walks (walk_date, slot, person, duration, comments)
       VALUES ('2026-05-01', 'morning', 'andrey', 45, 'старая запись')`
    ).run();

    migrate(db);

    const row = db.prepare("SELECT poop FROM walks WHERE walk_date = '2026-05-01'").get();
    expect(row.poop).toBeNull();
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

describe('длительность как отсутствие данных', () => {
  it('ноль сохраняется как null, а не как «ноль минут»', async () => {
    await request(app)
      .put('/api/walks/2026-08-01/morning')
      .send({ person: 'andrey', duration: 0 });

    const res = await request(app).get('/api/walks?from=2026-08-01&to=2026-08-01');
    expect(res.body[0].duration).toBeNull();
  });

  it('отсутствие поля тоже даёт null', async () => {
    await request(app).put('/api/walks/2026-08-01/morning').send({ person: 'ira' });

    const res = await request(app).get('/api/walks?from=2026-08-01&to=2026-08-01');
    expect(res.body[0].duration).toBeNull();
  });

  it('миграция v4 превращает старые нули в null', () => {
    const db = openDb(':memory:');
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
    db.prepare(
      "INSERT INTO walks (walk_date, slot, person, duration) VALUES ('2026-05-01','morning','andrey',0)"
    ).run();
    db.prepare(
      "INSERT INTO walks (walk_date, slot, person, duration) VALUES ('2026-05-01','evening','ira',45)"
    ).run();

    migrate(db);

    const rows = db.prepare('SELECT slot, duration FROM walks ORDER BY slot').all();
    expect(rows.find((r) => r.slot === 'morning').duration).toBeNull();
    expect(rows.find((r) => r.slot === 'evening').duration).toBe(45);
  });
});

describe('время возвращения', () => {
  it('сохраняется и отдаётся', async () => {
    await request(app)
      .put('/api/walks/2026-08-01/evening')
      .send({ person: 'andrey', duration: 40, endedAt: '2026-08-01T21:35' });

    const res = await request(app).get('/api/walks?from=2026-08-01&to=2026-08-01');
    expect(res.body[0].ended_at).toBe('2026-08-01T21:35');
  });

  it('отклоняет мусор вместо времени', async () => {
    const res = await request(app)
      .put('/api/walks/2026-08-01/evening')
      .send({ person: 'andrey', endedAt: 'вчера вечером' });
    expect(res.status).toBe(400);
  });
});

describe('журнал изменений', () => {
  it('записывает только изменившиеся поля', async () => {
    await request(app)
      .put('/api/walks/2026-08-01/morning')
      .send({ person: 'andrey', duration: 30 });
    await request(app)
      .put('/api/walks/2026-08-01/morning')
      .send({ person: 'ira', duration: 30 });

    const res = await request(app).get('/api/changes?date=2026-08-01&slot=morning');
    const fields = res.body.map((c) => c.field);

    expect(fields).toContain('person');
    // duration не менялась во втором запросе — записи о ней быть не должно
    expect(fields.filter((f) => f === 'duration')).toHaveLength(1);
  });

  it('хранит старое и новое значение', async () => {
    await request(app).put('/api/walks/2026-08-01/morning').send({ person: 'andrey' });
    await request(app).put('/api/walks/2026-08-01/morning').send({ person: 'both' });

    const res = await request(app).get('/api/changes?date=2026-08-01&slot=morning');
    const personChange = res.body.find((c) => c.field === 'person' && c.old_value === 'andrey');

    expect(personChange.new_value).toBe('both');
  });
});

describe('чтение .env', () => {
  it('не перезаписывает уже заданные переменные окружения', async () => {
    // Проверяем сам принцип: переменная процесса важнее файла.
    // Иначе DB_PATH из .env перебил бы путь к боевой базе от PM2.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dogwalks-env-'));
    const envPath = path.join(dir, '.env');
    fs.writeFileSync(envPath, 'DOGWALKS_TEST_A=из-файла\nDOGWALKS_TEST_B=из-файла\n');

    process.env.DOGWALKS_TEST_A = 'из-окружения';
    delete process.env.DOGWALKS_TEST_B;

    fs.readFileSync(envPath, 'utf8')
      .split('\n')
      .forEach((line) => {
        const separator = line.indexOf('=');
        if (separator === -1) return;
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        if (key && process.env[key] === undefined) process.env[key] = value;
      });

    expect(process.env.DOGWALKS_TEST_A).toBe('из-окружения');
    expect(process.env.DOGWALKS_TEST_B).toBe('из-файла');

    delete process.env.DOGWALKS_TEST_A;
    delete process.env.DOGWALKS_TEST_B;
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
