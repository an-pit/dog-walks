import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { buildPayload, estimateSize } from './payload.js';
import { callModel, PROMPT_VERSION, modelName } from './provider.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Промпт вынесен в отдельный файл, а не зашит в код: подбор формулировок —
// это десятки правок подряд, и каждая не должна выглядеть как правка логики.
// По умолчанию берётся файл из репозитория, то есть промпт версионируется
// вместе с кодом и приезжает деплоем.
//
// LLM_PROMPT_FILE переопределяет путь. Нужен для подбора прямо на сервере:
// деплой делает git reset --hard, и правка файла внутри репозитория
// не переживёт следующую выкатку. Файл вне репозитория — переживёт.
const DEFAULT_PROMPT_FILE = path.join(__dirname, '..', '..', 'prompts', 'report-system.md');

export function promptFile() {
  return process.env.LLM_PROMPT_FILE || DEFAULT_PROMPT_FILE;
}

/**
 * Читает промпт с диска на каждый вызов, без кэша.
 * Разборов — единицы в день, чтение файла на их фоне бесплатно,
 * зато правку промпта видно сразу, без перезапуска приложения.
 */
export function systemPrompt() {
  const file = promptFile();

  let text;
  try {
    text = fs.readFileSync(file, 'utf8').trim();
  } catch (cause) {
    const error = new Error(`Не удалось прочитать файл промпта: ${file}`);
    error.code = 'PROMPT_UNREADABLE';
    error.cause = cause;
    throw error;
  }

  if (!text) {
    const error = new Error(`Файл промпта пуст: ${file}`);
    error.code = 'PROMPT_UNREADABLE';
    throw error;
  }

  return {
    text,
    // Короткий хеш содержимого. Номер версии ставится руками и на сервере
    // не поднимется, а хеш меняется от любой правки сам — по нему видно,
    // каким именно текстом получен конкретный разбор.
    hash: crypto.createHash('sha256').update(text).digest('hex').slice(0, 8),
  };
}

/**
 * Готовит запрос и возвращает текст разбора.
 * Сеть изолирована в callModel, поэтому в тестах её можно подменить.
 */
export async function generateReport(rows, from, to, deps = {}) {
  const payload = buildPayload(rows, from, to);

  if (payload.period.daysWithWalks === 0) {
    const error = new Error('За период нет данных о прогулках');
    error.code = 'NO_DATA';
    throw error;
  }

  const size = estimateSize(payload);
  if (size > 200000) {
    const error = new Error('Слишком много данных за период, выберите период короче');
    error.code = 'PAYLOAD_TOO_BIG';
    throw error;
  }

  const user = [
    'Вот данные о прогулках с собакой за период.',
    'Числа уже посчитаны — пересчитывать их не нужно, объясни, что в них видно.',
    '',
    JSON.stringify(payload, null, 2),
  ].join('\n');

  const prompt = systemPrompt();
  const call = deps.callModel || callModel;
  const result = await call(prompt.text, user, deps);

  return {
    text: result.text,
    model: result.model,
    promptVersion: PROMPT_VERSION,
    promptHash: prompt.hash,
    payloadSize: size,
    usage: result.usage,
    finishReason: result.finishReason ?? null,
  };
}

/** Сохранённый разбор за период, если он уже есть */
export function findSaved(db, from, to) {
  return db
    .prepare(
      `SELECT id, period_from, period_to, content, model, prompt_version,
              prompt_hash, finish_reason, created_at
       FROM ai_reports
       WHERE period_from = ? AND period_to = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`
    )
    .get(from, to);
}

export function saveReport(db, from, to, report) {
  db.prepare(
    `INSERT INTO ai_reports
       (period_from, period_to, content, model, prompt_version, prompt_hash, finish_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    from,
    to,
    report.text,
    report.model,
    report.promptVersion,
    report.promptHash ?? null,
    report.finishReason ?? null
  );

  return findSaved(db, from, to);
}

export { modelName };
