import express from 'express';
import cors from 'cors';
import { observationsForDate, periodSummary } from './analytics/observations.js';
import { dailySeries } from './analytics/series.js';
import { generateReport, findSaved, saveReport } from './ai/report.js';
import { isConfigured } from './ai/provider.js';

const SLOTS = ['morning', 'afternoon', 'evening'];
const PERSONS = ['andrey', 'ira', 'both', 'none'];
const MAX_DURATION = 480;

// Отметка о туалете: null — не отмечено, 'yes' — покакал, 'no' — не покакал.
// null и 'no' различаются намеренно: «не проверяли» и «проверили, не было» —
// разные факты, и смешивать их в статистике нельзя.
const POOP_VALUES = [null, 'yes', 'no'];

// Валидация даты
function isValidDate(dateString) {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateString)) return false;
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date);
}

// Время возвращения: 'YYYY-MM-DDTHH:MM' либо с секундами
function isValidDateTime(value) {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return false;
  return !isNaN(new Date(value).getTime());
}

// Поля, изменения которых попадают в журнал
const TRACKED_FIELDS = ['person', 'duration', 'comments', 'poop', 'ended_at'];

/**
 * Пишет в журнал только реально изменившиеся поля.
 * changed_by пока не заполняется: пользователей в приложении ещё нет.
 * Журнал не должен ронять запись прогулки, поэтому ошибки здесь глушатся.
 */
function recordChanges(db, date, slot, before, after) {
  try {
    const insert = db.prepare(
      `INSERT INTO walk_changes (walk_date, slot, field, old_value, new_value)
       VALUES (?, ?, ?, ?, ?)`
    );

    const write = db.transaction(() => {
      TRACKED_FIELDS.forEach((field) => {
        const oldValue = before ? before[field] : null;
        const newValue = after[field];

        const normalize = (v) => (v === null || v === undefined || v === '' ? null : String(v));
        if (normalize(oldValue) === normalize(newValue)) return;

        insert.run(date, slot, field, normalize(oldValue), normalize(newValue));
      });
    });

    write();
  } catch (error) {
    console.error('Не удалось записать изменение в журнал:', error);
  }
}

/**
 * Собирает Express-приложение поверх переданного подключения к базе.
 *
 * Приложение намеренно НЕ слушает порт — этим занимается server.js.
 * Благодаря этому тесты могут импортировать createApp, подсунуть базу
 * в памяти и дёргать эндпоинты напрямую, не поднимая настоящий сервер.
 */
export function createApp(db) {
  const app = express();

  app.use(cors());
  // Ограничение размера тела запроса: без него можно прислать мегабайты
  // текста в поле comments и раздуть базу.
  app.use(express.json({ limit: '100kb' }));

  // GET /api/health — для автодеплоя и мониторинга.
  // Выведен из-под Basic Auth в nginx, поэтому не раскрывает никаких данных.
  app.get('/api/health', (req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.json({
        status: 'ok',
        version: process.env.APP_VERSION || 'dev',
      });
    } catch (error) {
      console.error('Health-check не прошёл:', error);
      res.status(500).json({ status: 'error' });
    }
  });

  // GET /api/walks?from=YYYY-MM-DD&to=YYYY-MM-DD
  app.get('/api/walks', (req, res) => {
    try {
      const { from, to } = req.query;

      if (!from || !to) {
        return res.status(400).json({ error: 'Параметры from и to обязательны' });
      }

      if (!isValidDate(from) || !isValidDate(to)) {
        return res.status(400).json({ error: 'Неверный формат даты. Используйте YYYY-MM-DD' });
      }

      const walks = db
        .prepare(
          `SELECT * FROM walks
           WHERE walk_date BETWEEN ? AND ?
           ORDER BY walk_date, slot`
        )
        .all(from, to);

      res.json(walks);
    } catch (error) {
      console.error('Ошибка получения прогулок:', error);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  });

  // PUT /api/walks/:date/:slot
  app.put('/api/walks/:date/:slot', (req, res) => {
    try {
      const { date, slot } = req.params;
      const { person, comments = '', poop = null } = req.body;
      // duration приходит числом либо null: null означает «не засекали».
      // До миграции v4 эти два случая были неразличимы.
      const duration = req.body.duration === undefined ? null : req.body.duration;
      const endedAt = req.body.endedAt ?? req.body.ended_at ?? null;

      if (!isValidDate(date)) {
        return res.status(400).json({ error: 'Неверный формат даты. Используйте YYYY-MM-DD' });
      }

      if (!SLOTS.includes(slot)) {
        return res
          .status(400)
          .json({ error: `Неверный слот. Допустимые значения: ${SLOTS.join(', ')}` });
      }

      if (!PERSONS.includes(person)) {
        return res
          .status(400)
          .json({ error: `Неверное значение person. Допустимые значения: ${PERSONS.join(', ')}` });
      }

      let durationNum = null;
      if (duration !== null && duration !== '') {
        durationNum = parseInt(duration);
        if (isNaN(durationNum) || durationNum < 0 || durationNum > MAX_DURATION) {
          return res
            .status(400)
            .json({ error: `Длительность должна быть числом от 0 до ${MAX_DURATION} минут` });
        }
        // Ноль означает «не засекали» — храним как отсутствие данных
        if (durationNum === 0) durationNum = null;
      }

      if (endedAt !== null && !isValidDateTime(endedAt)) {
        return res
          .status(400)
          .json({ error: 'Неверный формат времени. Используйте YYYY-MM-DDTHH:MM' });
      }

      const poopValue = poop === undefined ? null : poop;
      if (!POOP_VALUES.includes(poopValue)) {
        return res
          .status(400)
          .json({ error: 'Неверное значение poop. Допустимые значения: null, yes, no' });
      }

      // Читаем прежнее состояние до записи — нужно для журнала изменений
      const before = db
        .prepare('SELECT * FROM walks WHERE walk_date = ? AND slot = ?')
        .get(date, slot);

      const result = db
        .prepare(
          `INSERT INTO walks (walk_date, slot, person, duration, comments, poop, ended_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(walk_date, slot)
           DO UPDATE SET
             person = excluded.person,
             duration = excluded.duration,
             comments = excluded.comments,
             poop = excluded.poop,
             ended_at = excluded.ended_at,
             updated_at = CURRENT_TIMESTAMP`
        )
        .run(date, slot, person, durationNum, comments, poopValue, endedAt);

      recordChanges(db, date, slot, before, {
        person,
        duration: durationNum,
        comments,
        poop: poopValue,
        ended_at: endedAt,
      });

      res.json({
        success: true,
        message: 'Прогулка обновлена',
        changes: result.changes,
      });
    } catch (error) {
      console.error('Ошибка обновления прогулки:', error);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  });

  // GET /api/stats?from=YYYY-MM-DD&to=YYYY-MM-DD
  app.get('/api/stats', (req, res) => {
    try {
      const { from, to } = req.query;

      if (!from || !to) {
        return res.status(400).json({ error: 'Параметры from и to обязательны' });
      }

      if (!isValidDate(from) || !isValidDate(to)) {
        return res.status(400).json({ error: 'Неверный формат даты. Используйте YYYY-MM-DD' });
      }

      const walks = db
        .prepare(
          `SELECT * FROM walks
           WHERE walk_date BETWEEN ? AND ?
           ORDER BY walk_date, slot`
        )
        .all(from, to);

      const stats = {
        andrey: 0,
        ira: 0,
        // Считаем состоявшиеся прогулки, а не строки в таблице.
        // Запись person='none' означает «в этот слот никто не выходил» —
        // это осознанная отметка об отсутствии прогулки, и раньше она
        // раздувала «Всего» тем сильнее, чем длиннее период.
        total: 0,
        // Сколько дней за период вообще имеют записи. Нужно, чтобы отличить
        // «гуляли мало» от «за эти дни просто ничего не заполняли».
        daysWithRecords: 0,
        daysWithWalks: 0,
        totalDuration: 0,
        andreyDuration: 0,
        iraDuration: 0,
        // Отметки о туалете. poopMarked — сколько прогулок вообще отмечено,
        // чтобы можно было честно считать долю: «покакал в 12 из 15 отмеченных»,
        // а не «в 12 из 280», где 265 записей просто не заполнялись.
        poopYes: 0,
        poopNo: 0,
        poopMarked: 0,
      };

      const datesWithRecords = new Set();
      const datesWithWalks = new Set();

      walks.forEach((walk) => {
        const duration = walk.duration || 0;
        datesWithRecords.add(walk.walk_date);

        if (walk.person === 'none') return;

        stats.total++;
        stats.totalDuration += duration;
        datesWithWalks.add(walk.walk_date);

        if (walk.person === 'andrey') {
          stats.andrey++;
          stats.andreyDuration += duration;
        }
        if (walk.person === 'ira') {
          stats.ira++;
          stats.iraDuration += duration;
        }
        if (walk.person === 'both') {
          stats.andrey++;
          stats.ira++;
          stats.andreyDuration += duration;
          stats.iraDuration += duration;
        }

        if (walk.poop === 'yes') {
          stats.poopYes++;
          stats.poopMarked++;
        }
        if (walk.poop === 'no') {
          stats.poopNo++;
          stats.poopMarked++;
        }
      });

      stats.daysWithRecords = datesWithRecords.size;
      stats.daysWithWalks = datesWithWalks.size;

      res.json({
        period: { from, to },
        statistics: stats,
        walks: walks,
      });
    } catch (error) {
      console.error('Ошибка получения статистики:', error);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  });

  // GET /api/export?from=YYYY-MM-DD&to=YYYY-MM-DD
  app.get('/api/export', (req, res) => {
    try {
      const { from, to } = req.query;

      if (!from || !to) {
        return res.status(400).json({ error: 'Параметры from и to обязательны' });
      }

      if (!isValidDate(from) || !isValidDate(to)) {
        return res.status(400).json({ error: 'Неверный формат даты. Используйте YYYY-MM-DD' });
      }

      const walks = db
        .prepare(
          `SELECT * FROM walks
           WHERE walk_date BETWEEN ? AND ?
           ORDER BY walk_date, slot`
        )
        .all(from, to);

      const personMap = { andrey: 'Андрей', ira: 'Ира', both: 'Оба', none: 'Никто' };
      const slotMap = { morning: 'Утро', afternoon: 'День', evening: 'Вечер' };
      const poopMap = { yes: 'Да', no: 'Нет' };

      let csv = 'Дата,Слот,Кто гулял,Длительность (мин),Туалет,Время возвращения,Комментарий\n';

      walks.forEach((walk) => {
        const escapedComments = (walk.comments || '').replace(/"/g, '""').replace(/,/g, ';');
        // Не отмеченные прогулки остаются пустой ячейкой, а не «Нет»
        const poopLabel = poopMap[walk.poop] || '';
        csv += `${walk.walk_date},${slotMap[walk.slot]},${personMap[walk.person]},${walk.duration ?? ''},${poopLabel},${walk.ended_at || ''},"${escapedComments}"\n`;
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=walks_${from}_${to}.csv`);
      res.send(csv);
    } catch (error) {
      console.error('Ошибка экспорта:', error);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  });

  // GET /api/insights?date=YYYY-MM-DD — наблюдения за день.
  // Берём 60 дней истории: базовой линии нужно 28, плюс запас
  // на пропуски и на подсчёт серий без отметок.
  app.get('/api/insights', (req, res) => {
    try {
      const date = req.query.date || new Date().toISOString().slice(0, 10);

      if (!isValidDate(date)) {
        return res.status(400).json({ error: 'Неверный формат даты. Используйте YYYY-MM-DD' });
      }

      const from = new Date(`${date}T12:00:00`);
      from.setDate(from.getDate() - 60);

      const rows = db
        .prepare(
          `SELECT * FROM walks
           WHERE walk_date BETWEEN ? AND ?
           ORDER BY walk_date, slot`
        )
        .all(from.toISOString().slice(0, 10), date);

      res.json(observationsForDate(rows, date));
    } catch (error) {
      console.error('Ошибка расчёта наблюдений:', error);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  });

  // GET /api/summary?from=&to= — сводка за период для страницы статистики
  app.get('/api/summary', (req, res) => {
    try {
      const { from, to } = req.query;

      if (!isValidDate(from) || !isValidDate(to)) {
        return res.status(400).json({ error: 'Неверный формат даты. Используйте YYYY-MM-DD' });
      }

      const rows = db
        .prepare(
          `SELECT * FROM walks
           WHERE walk_date BETWEEN ? AND ?
           ORDER BY walk_date, slot`
        )
        .all(from, to);

      res.json(periodSummary(rows));
    } catch (error) {
      console.error('Ошибка расчёта сводки:', error);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  });

  // GET /api/series?from=&to= — ряд по дням для графика
  app.get('/api/series', (req, res) => {
    try {
      const { from, to } = req.query;

      if (!isValidDate(from) || !isValidDate(to)) {
        return res.status(400).json({ error: 'Неверный формат даты. Используйте YYYY-MM-DD' });
      }

      // Берём на 28 дней раньше начала периода: скользящей медиане
      // нужна история, иначе в начале графика линии не будет
      const historyFrom = new Date(`${from}T12:00:00`);
      historyFrom.setDate(historyFrom.getDate() - 28);

      const rows = db
        .prepare(
          `SELECT * FROM walks
           WHERE walk_date BETWEEN ? AND ?
           ORDER BY walk_date, slot`
        )
        .all(historyFrom.toISOString().slice(0, 10), to);

      res.json(dailySeries(rows, from, to));
    } catch (error) {
      console.error('Ошибка построения ряда:', error);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  });

  // GET /api/ai-report?from=&to= — сохранённый разбор, если он есть
  app.get('/api/ai-report', (req, res) => {
    try {
      const { from, to } = req.query;

      if (!isValidDate(from) || !isValidDate(to)) {
        return res.status(400).json({ error: 'Неверный формат даты. Используйте YYYY-MM-DD' });
      }

      const saved = findSaved(db, from, to);
      res.json({ report: saved || null, available: isConfigured() });
    } catch (error) {
      console.error('Ошибка чтения разбора:', error);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  });

  // POST /api/ai-report — сгенерировать разбор заново.
  // Метод POST, а не GET: запрос стоит денег и меняет состояние,
  // такое не должно случаться от простого перехода по ссылке.
  app.post('/api/ai-report', async (req, res) => {
    try {
      const { from, to } = req.body || {};

      if (!isValidDate(from) || !isValidDate(to)) {
        return res.status(400).json({ error: 'Неверный формат даты. Используйте YYYY-MM-DD' });
      }

      const rows = db
        .prepare(
          `SELECT * FROM walks
           WHERE walk_date BETWEEN ? AND ?
           ORDER BY walk_date, slot`
        )
        .all(from, to);

      const report = await generateReport(rows, from, to);
      const saved = saveReport(db, from, to, report);

      res.json({ report: saved });
    } catch (error) {
      // Понятные пользователю ошибки отделяем от внутренних
      const known = {
        LLM_NOT_CONFIGURED: [503, 'Разбор недоступен: модель не настроена на сервере'],
        NO_DATA: [400, 'За выбранный период нет данных о прогулках'],
        PROMPT_UNREADABLE: [500, 'Не удалось прочитать файл промпта на сервере'],
        PAYLOAD_TOO_BIG: [400, 'Слишком длинный период, выберите короче'],
        LLM_HTTP_ERROR: [502, 'Модель временно недоступна, попробуйте позже'],
        LLM_EMPTY: [502, 'Модель вернула пустой ответ, попробуйте ещё раз'],
        LLM_TRUNCATED_EMPTY: [
          502,
          'Модели не хватило лимита токенов на ответ. Увеличьте LLM_MAX_TOKENS в .env на сервере',
        ],
      };

      if (known[error.code]) {
        const [status, message] = known[error.code];
        return res.status(status).json({ error: message });
      }

      console.error('Ошибка генерации разбора:', error);
      res.status(500).json({ error: 'Не удалось построить разбор' });
    }
  });

  // GET /api/changes?date=&slot= — журнал изменений записи
  app.get('/api/changes', (req, res) => {
    try {
      const { date, slot } = req.query;

      if (!isValidDate(date) || !SLOTS.includes(slot)) {
        return res.status(400).json({ error: 'Нужны корректные date и slot' });
      }

      const changes = db
        .prepare(
          `SELECT field, old_value, new_value, changed_by, changed_at
           FROM walk_changes
           WHERE walk_date = ? AND slot = ?
           ORDER BY changed_at DESC, id DESC
           LIMIT 50`
        )
        .all(date, slot);

      res.json(changes);
    } catch (error) {
      console.error('Ошибка чтения журнала:', error);
      res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
  });

  return app;
}
