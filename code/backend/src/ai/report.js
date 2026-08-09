import { buildPayload, estimateSize } from './payload.js';
import { callModel, PROMPT_VERSION, modelName } from './provider.js';

// Промпт лежит здесь и версионируется: вместе с результатом сохраняем
// номер версии, чтобы потом было понятно, чем именно он получен
const SYSTEM_PROMPT = `Ты помогаешь владельцам собаки читать их собственные записи о прогулках.

Правила:
- Описывай факты и закономерности, не давай медицинских оценок и рекомендаций.
- Не утверждай, что что-то «нормально» или «мало» — приводи наблюдение и цифры.
- Если данных для вывода не хватает, скажи об этом прямо.
- Отдельно отмечай, что видно из комментариев и чего в цифрах не видно.
- Пиши по-русски, спокойно, без восклицаний и без обращений «вы молодцы».
- 4–6 коротких абзацев, без заголовков и списков.
- Если что-то выглядит поводом показаться ветеринару, скажи об этом
  одной фразой и без драматизации.`;

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

  const call = deps.callModel || callModel;
  const result = await call(SYSTEM_PROMPT, user, deps);

  return {
    text: result.text,
    model: result.model,
    promptVersion: PROMPT_VERSION,
    payloadSize: size,
    usage: result.usage,
  };
}

/** Сохранённый разбор за период, если он уже есть */
export function findSaved(db, from, to) {
  return db
    .prepare(
      `SELECT id, period_from, period_to, content, model, prompt_version, created_at
       FROM ai_reports
       WHERE period_from = ? AND period_to = ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get(from, to);
}

export function saveReport(db, from, to, report) {
  db.prepare(
    `INSERT INTO ai_reports (period_from, period_to, content, model, prompt_version)
     VALUES (?, ?, ?, ?, ?)`
  ).run(from, to, report.text, report.model, report.promptVersion);

  return findSaved(db, from, to);
}

export { modelName };
