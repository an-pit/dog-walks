/**
 * Вызов языковой модели.
 *
 * Провайдер задаётся переменными окружения, а не кодом: протокол
 * OpenAI-совместимый, его понимают YandexGPT и большинство остальных.
 * Сменить поставщика — поменять три строки в .env.
 *
 * LLM_BASE_URL    — для Yandex AI Studio: https://llm.api.cloud.yandex.net/v1
 * LLM_API_KEY     — ключ сервисного аккаунта, живёт только на сервере
 * LLM_MODEL       — полный URI: gpt://<id-каталога>/<модель>/latest
 * LLM_TEMPERATURE — необязательно, по умолчанию 0.3
 * LLM_MAX_TOKENS  — необязательно, по умолчанию 1200
 *
 * Температура и лимит вынесены в окружение намеренно: подкрутить их
 * можно правкой .env и `pm2 reload`, без выкатки кода. А промпт остаётся
 * в репозитории — он часть логики и должен версионироваться вместе с ней.
 *
 * Ключ никогда не попадает во фронтенд: браузер ходит в наш бэкенд,
 * бэкенд — к модели. Иначе ключ утёк бы первому же посетителю.
 */

export const PROMPT_VERSION = 1;

export function isConfigured() {
  return Boolean(process.env.LLM_API_KEY && process.env.LLM_BASE_URL);
}

export function modelName() {
  return process.env.LLM_MODEL || 'unknown';
}

// Number() без запасного значения превратил бы пустую строку в 0
function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && process.env[name] ? value : fallback;
}

/**
 * @param {string} system — системная инструкция
 * @param {string} user — данные и вопрос
 * @param {object} deps — точка подмены в тестах
 */
export async function callModel(system, user, deps = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;

  if (!isConfigured()) {
    const error = new Error('Модель не настроена: нет LLM_API_KEY или LLM_BASE_URL');
    error.code = 'LLM_NOT_CONFIGURED';
    throw error;
  }

  // Ограничиваем время ожидания: висящий запрос держал бы соединение
  // до таймаута nginx и выглядел бы как зависшее приложение
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetchFn(`${process.env.LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: modelName(),
        max_tokens: envNumber('LLM_MAX_TOKENS', 1200),
        temperature: envNumber('LLM_TEMPERATURE', 0.3),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      const error = new Error(`Модель вернула ${response.status}`);
      error.code = 'LLM_HTTP_ERROR';
      // Тело ответа не показываем пользователю: там может быть служебная
      // информация. В лог — можно.
      console.error('Ошибка вызова модели:', response.status, body.slice(0, 500));
      throw error;
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
      const error = new Error('Модель вернула пустой ответ');
      error.code = 'LLM_EMPTY';
      throw error;
    }

    return {
      text,
      model: data.model || modelName(),
      usage: data.usage || null,
    };
  } finally {
    clearTimeout(timeout);
  }
}
