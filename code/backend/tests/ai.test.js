import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { openDb } from '../src/db.js';
import { migrate } from '../src/migrations.js';
import { createApp } from '../src/app.js';
import { buildPayload, estimateSize } from '../src/ai/payload.js';
import { generateReport, saveReport, findSaved } from '../src/ai/report.js';

const row = (date, slot, person, duration = null, extra = {}) => ({
  walk_date: date,
  slot,
  person,
  duration,
  comments: '',
  poop: null,
  ended_at: null,
  ...extra,
});

describe('сборка данных для модели', () => {
  it('считает итоги, не отправляя сырые записи целиком', () => {
    const payload = buildPayload(
      [
        row('2026-08-01', 'morning', 'andrey', 40),
        row('2026-08-01', 'evening', 'ira', 50),
      ],
      '2026-08-01',
      '2026-08-01'
    );

    expect(payload.totals.walks).toBe(2);
    expect(payload.totals.minutes).toBe(90);
    expect(payload.byDay).toHaveLength(1);
  });

  it('передаёт комментарии — ради них модель и нужна', () => {
    const payload = buildPayload(
      [row('2026-08-01', 'morning', 'andrey', 40, { comments: 'хромал на левую' })],
      '2026-08-01',
      '2026-08-01'
    );

    expect(payload.comments).toHaveLength(1);
    expect(payload.comments[0].text).toBe('хромал на левую');
  });

  it('сообщает модели о неполноте данных, чтобы она не додумывала', () => {
    const payload = buildPayload([row('2026-08-01', 'morning', 'andrey')], '2026-08-01', '2026-08-01');

    expect(payload.dataNotes.minutesMayBeMissing).toBeTruthy();
    expect(payload.dataNotes.poopMayBeUnmarked).toBeTruthy();
    expect(payload.byDay[0].timed).toBe(0);
  });

  it('размер оценивается', () => {
    const payload = buildPayload([row('2026-08-01', 'morning', 'andrey', 40)], '2026-08-01', '2026-08-01');
    expect(estimateSize(payload)).toBeGreaterThan(0);
  });
});

describe('генерация разбора', () => {
  it('не ходит в сеть, если за период нет прогулок', async () => {
    const callModel = vi.fn();

    await expect(
      generateReport([], '2026-08-01', '2026-08-02', { callModel })
    ).rejects.toMatchObject({ code: 'NO_DATA' });

    // Главное: пустой запрос не должен стоить денег
    expect(callModel).not.toHaveBeenCalled();
  });

  it('передаёт модели системную инструкцию и данные', async () => {
    const callModel = vi.fn().mockResolvedValue({ text: 'разбор', model: 'test-model' });

    const result = await generateReport(
      [row('2026-08-01', 'morning', 'andrey', 40)],
      '2026-08-01',
      '2026-08-01',
      { callModel }
    );

    const [system, user] = callModel.mock.calls[0];
    expect(system).toContain('не давай медицинских оценок');
    expect(user).toContain('2026-08-01');
    expect(result.text).toBe('разбор');
    expect(result.promptVersion).toBeGreaterThan(0);
  });
});

describe('хранение разборов', () => {
  it('сохраняет и находит по периоду', () => {
    const db = openDb(':memory:');
    migrate(db);

    saveReport(db, '2026-08-01', '2026-08-07', {
      text: 'текст разбора',
      model: 'test-model',
      promptVersion: 1,
    });

    const saved = findSaved(db, '2026-08-01', '2026-08-07');
    expect(saved.content).toBe('текст разбора');
    expect(saved.prompt_version).toBe(1);
  });

  it('за другой период разбора нет', () => {
    const db = openDb(':memory:');
    migrate(db);
    expect(findSaved(db, '2026-01-01', '2026-01-07')).toBeUndefined();
  });
});

describe('эндпоинт разбора', () => {
  it('без настроенной модели отвечает понятной ошибкой, а не падает', async () => {
    const db = openDb(':memory:');
    migrate(db);
    const app = createApp(db);

    await request(app).put('/api/walks/2026-08-01/morning').send({ person: 'andrey', duration: 40 });

    const res = await request(app)
      .post('/api/ai-report')
      .send({ from: '2026-08-01', to: '2026-08-01' });

    expect(res.status).toBe(503);
    expect(res.body.error).toContain('не настроена');
  });

  it('GET сообщает, доступна ли генерация', async () => {
    const db = openDb(':memory:');
    migrate(db);
    const app = createApp(db);

    const res = await request(app).get('/api/ai-report?from=2026-08-01&to=2026-08-07');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('available');
    expect(res.body.report).toBeNull();
  });
});

describe('ряд для графика', () => {
  it('заполняет пропущенные дни нулями, а не пропускает их', async () => {
    const db = openDb(':memory:');
    migrate(db);
    const app = createApp(db);

    await request(app).put('/api/walks/2026-08-01/morning').send({ person: 'andrey', duration: 40 });

    const res = await request(app).get('/api/series?from=2026-08-01&to=2026-08-03');

    expect(res.body).toHaveLength(3);
    expect(res.body[0].minutes).toBe(40);
    expect(res.body[1].minutes).toBe(0);
  });

  it('не рисует медиану, пока данных мало', async () => {
    const db = openDb(':memory:');
    migrate(db);
    const app = createApp(db);

    const res = await request(app).get('/api/series?from=2026-08-01&to=2026-08-02');
    expect(res.body.every((d) => d.baseline === null)).toBe(true);
  });
});
