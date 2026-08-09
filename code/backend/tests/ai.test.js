import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { openDb } from '../src/db.js';
import { migrate } from '../src/migrations.js';
import { createApp } from '../src/app.js';
import { buildPayload, estimateSize } from '../src/ai/payload.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  generateReport,
  saveReport,
  findSaved,
  systemPrompt,
  promptFile,
} from '../src/ai/report.js';
import { callModel } from '../src/ai/provider.js';

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

describe('обрыв ответа модели', () => {
  it('сохраняет и отдаёт причину завершения', () => {
    const db = openDb(':memory:');
    migrate(db);

    saveReport(db, '2026-08-01', '2026-08-07', {
      text: 'За период зафиксировано 22 прогулки, в среднем около',
      model: 'test-model',
      promptVersion: 1,
      finishReason: 'length',
    });

    // Без этой отметки обрезанный текст неотличим от короткого ответа
    expect(findSaved(db, '2026-08-01', '2026-08-07').finish_reason).toBe('length');
    db.close();
  });

  it('прокидывает finish_reason из ответа модели', async () => {
    const callModel = vi.fn().mockResolvedValue({
      text: 'разбор',
      model: 'test-model',
      finishReason: 'length',
    });

    const report = await generateReport(
      [row('2026-08-01', 'morning', 'andrey', 40)],
      '2026-08-01',
      '2026-08-01',
      { callModel }
    );

    expect(report.finishReason).toBe('length');
  });
});

describe('пустой ответ модели', () => {
  const withEnv = async (fn) => {
    const saved = { ...process.env };
    process.env.LLM_BASE_URL = 'https://example.invalid/v1';
    process.env.LLM_API_KEY = 'test';
    process.env.LLM_MODEL = 'test-model';
    try {
      await fn();
    } finally {
      process.env = saved;
    }
  };

  const reply = (body) => ({ ok: true, json: async () => body });

  it('отличает исчерпанный лимит токенов от просто пустого ответа', async () => {
    await withEnv(async () => {
      const fetch = vi.fn().mockResolvedValue(
        reply({ choices: [{ message: { content: '' }, finish_reason: 'length' }] })
      );

      // Рассуждающие модели тратят лимит на размышления и до ответа не доходят.
      // По общему «пустой ответ» этого не понять, а чинится оно одной строкой в .env
      await expect(callModel('s', 'u', { fetch })).rejects.toMatchObject({
        code: 'LLM_TRUNCATED_EMPTY',
      });
    });
  });

  it('обычный пустой ответ остаётся LLM_EMPTY', async () => {
    await withEnv(async () => {
      const fetch = vi.fn().mockResolvedValue(
        reply({ choices: [{ message: { content: '   ' }, finish_reason: 'stop' }] })
      );

      await expect(callModel('s', 'u', { fetch })).rejects.toMatchObject({
        code: 'LLM_EMPTY',
      });
    });
  });
});

describe('промпт в отдельном файле', () => {
  it('по умолчанию читается из репозитория и не пуст', () => {
    const prompt = systemPrompt();
    expect(prompt.text.length).toBeGreaterThan(100);
    expect(prompt.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('LLM_PROMPT_FILE подменяет файл — так промпт правят на сервере', async () => {
    const file = path.join(os.tmpdir(), `prompt-${Date.now()}.md`);
    fs.writeFileSync(file, 'Пиши одним предложением.');
    const saved = process.env.LLM_PROMPT_FILE;
    process.env.LLM_PROMPT_FILE = file;

    try {
      expect(promptFile()).toBe(file);

      const callModel = vi.fn().mockResolvedValue({ text: 'разбор', model: 'test-model' });
      await generateReport(
        [row('2026-08-01', 'morning', 'andrey', 40)],
        '2026-08-01',
        '2026-08-01',
        { callModel }
      );

      expect(callModel.mock.calls[0][0]).toBe('Пиши одним предложением.');
    } finally {
      if (saved === undefined) delete process.env.LLM_PROMPT_FILE;
      else process.env.LLM_PROMPT_FILE = saved;
      fs.unlinkSync(file);
    }
  });

  it('понятная ошибка, если файл потерялся', () => {
    const saved = process.env.LLM_PROMPT_FILE;
    process.env.LLM_PROMPT_FILE = '/nope/missing-prompt.md';

    try {
      expect(() => systemPrompt()).toThrow(/файл промпта/i);
    } finally {
      if (saved === undefined) delete process.env.LLM_PROMPT_FILE;
      else process.env.LLM_PROMPT_FILE = saved;
    }
  });
});
